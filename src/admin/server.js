// Веб-админка: список клиентов/анкет и редактирование вопросов анкеты без
// прямых SQL-запросов. Отдельный процесс от бота (свой npm-скрипт, свой сервис
// в docker-compose.yml), общая с ботом БД через src/*.
const express = require('express');
const { Telegraf } = require('telegraf');
const { ADMIN_WEB, BOT_TOKEN } = require('../config');
const { escapeHtml, layout, AJAX_FORMS_SCRIPT } = require('./html');
const { pageSizeFor, getPage, getOffset, pagerHtml } = require('./pagination');
const clients = require('../clients');
const survey = require('../survey');
const admins = require('../admins');
const groups = require('../groups');
const audit = require('../audit');
const gyms = require('../gyms');
const equipment = require('../equipment');
const media = require('../media');
const snapshots = require('../client-snapshots');
const menuConfig = require('../menu-config');
const clientSurveys = require('../client-surveys');
const measurements = require('../measurements');
const { setDefaultMenu, syncAllAdminMenus } = require('../menu');

// Только для перезапроса файлов фото у Telegram API (getFileLink) — веб-админка
// сама с ботом не общается и обновлений не получает, только скачивает файлы.
const telegram = BOT_TOKEN ? new Telegraf(BOT_TOKEN).telegram : null;

if (!ADMIN_WEB.password) {
  console.error(
    'ADMIN_WEB_PASSWORD не задан в .env — веб-админка не может стартовать без пароля. См. .env.example.'
  );
  process.exit(1);
}

const app = express();
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Basic ')) {
    const [user, pass] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    if (user === ADMIN_WEB.user && pass === ADMIN_WEB.password) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Health Coach Admin"');
  res.status(401).send('Требуется авторизация');
});

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ');
}

function wrapErrors(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function groupSelectOptions(allGroups, selectedId, noneLabel) {
  const noneOpt = `<option value=""${!selectedId ? ' selected' : ''}>${escapeHtml(noneLabel)}</option>`;
  const opts = allGroups
    .map(
      (g) =>
        `<option value="${g.id}"${String(selectedId) === String(g.id) ? ' selected' : ''}>${escapeHtml(g.name)}</option>`
    )
    .join('');
  return noneOpt + opts;
}

// ---- Дашборд -----------------------------------------------------------

app.get(
  '/',
  wrapErrors(async (req, res) => {
    const stats = await clients.getStats();
    const strategies = await survey.listStrategies();

    const statusStats = stats.byStatus
      .map((r) => `<div class="stat"><span class="n">${r.n}</span><span class="label">${escapeHtml(r.status)}</span></div>`)
      .join('');

    const body = `
      <h2>Дашборд</h2>
      <div class="card stat-grid">
        <div class="stat"><span class="n">${stats.total}</span><span class="label">Клиентов всего</span></div>
        <div class="stat"><span class="n">${stats.totalAnswers}</span><span class="label">Ответов сохранено</span></div>
        ${statusStats}
      </div>
      <div class="card">
        <h2>Стратегии анкеты</h2>
        <div class="table-wrap">
        <table>
          <tr><th>Код</th><th>Название</th><th>Вопросов</th></tr>
          ${strategies
            .map(
              (s) =>
                `<tr><td><a href="/strategies/${escapeHtml(s.code)}">${escapeHtml(s.code)}</a></td><td>${escapeHtml(s.name)}</td><td>${s.question_count}</td></tr>`
            )
            .join('')}
        </table>
        </div>
      </div>`;
    res.send(layout({ title: 'Дашборд', active: '/', body }));
  })
);

// ---- Клиенты ------------------------------------------------------------

app.get(
  '/clients',
  wrapErrors(async (req, res) => {
    const deletedOnly = req.query.deleted === '1';
    const page = getPage(req);
    const pageSize = pageSizeFor('clients');
    const [list, total, allGroups] = await Promise.all([
      clients.listClients({ limit: pageSize, offset: getOffset(req, 'clients'), deletedOnly }),
      clients.countClients({ deletedOnly }),
      groups.listGroups(),
    ]);
    const rows = list
      .map(
        (c) => `<tr>
          <td><a href="/clients/${c.id}">#${c.id}</a></td>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.city)}</td>
          <td><span class="pill">${escapeHtml(c.status)}</span></td>
          <td>${escapeHtml(c.survey_strategy || '—')}</td>
          <td>
            ${
              deletedOnly
                ? '<span class="muted">—</span>'
                : `<form class="inline" method="post" action="/clients/${c.id}/group">
                     <select name="groupId">${groupSelectOptions(allGroups, c.group_id, '— без группы —')}</select>
                     <button type="submit" class="secondary">✓</button>
                   </form>`
            }
          </td>
          <td>${c.wants_plan ? 'да' : 'нет'}</td>
          <td class="muted">${fmtDate(deletedOnly ? c.deleted_at : c.created_at)}</td>
          <td>
            ${
              deletedOnly
                ? `<form method="post" action="/clients/${c.id}/restore">
                     <button type="submit" class="secondary">Восстановить</button>
                   </form>`
                : `<form method="post" action="/clients/${c.id}/delete" onsubmit="return confirm('Удалить клиента #${c.id} ${escapeHtml(c.name).replace(/'/g, '')}? Это мягкое удаление — данные останутся в базе, можно будет восстановить в разделе «Удалённые».');">
                     <button type="submit" class="icon-danger" title="Удалить клиента">✕</button>
                   </form>`
            }
          </td>
        </tr>`
      )
      .join('');

    const baseUrl = deletedOnly ? '/clients?deleted=1' : '/clients';
    const body = `
      <h2>${deletedOnly ? 'Удалённые клиенты' : 'Клиенты'} (${total})</h2>
      <p class="muted">
        ${deletedOnly ? 'Мягко удалённые — данные не потеряны, можно восстановить.' : ''}
        <a href="/clients${deletedOnly ? '' : '?deleted=1'}">${deletedOnly ? '← К активным клиентам' : 'Удалённые →'}</a>
      </p>
      <div class="card">
        <div class="table-wrap">
        <table>
          <tr><th>ID</th><th>Имя</th><th>Город</th><th>Статус</th><th>Стратегия</th><th>Группа</th><th>Хочет план</th><th>${deletedOnly ? 'Удалён' : 'Создан'}</th><th></th></tr>
          ${rows || `<tr><td colspan="9" class="muted">${deletedOnly ? 'Удалённых клиентов нет' : 'Клиентов пока нет'}</td></tr>`}
        </table>
        </div>
        ${pagerHtml('clients', baseUrl, page, total)}
      </div>`;
    res.send(layout({ title: deletedOnly ? 'Удалённые клиенты' : 'Клиенты', active: '/clients', body }));
  })
);

app.post(
  '/clients/:id/delete',
  wrapErrors(async (req, res) => {
    await clients.deleteClient(req.params.id);
    res.redirect('/clients');
  })
);

app.post(
  '/clients/:id/restore',
  wrapErrors(async (req, res) => {
    await clients.restoreClient(req.params.id);
    res.redirect(req.get('Referer') && req.get('Referer').includes('deleted=1') ? '/clients?deleted=1' : `/clients/${req.params.id}`);
  })
);

app.post(
  '/clients/:id/group',
  wrapErrors(async (req, res) => {
    const groupId = req.body.groupId ? Number(req.body.groupId) : null;
    await clients.setClientGroup(req.params.id, groupId);
    res.redirect(req.get('Referer') && req.get('Referer').includes(`/clients/${req.params.id}`) ? `/clients/${req.params.id}` : '/clients');
  })
);

app.post(
  '/clients/:id/measurement-settings',
  wrapErrors(async (req, res) => {
    await clients.setMeasurementSettings(req.params.id, {
      measurementsEnabled: !!req.body.measurementsEnabled,
      remindersEnabled: !!req.body.remindersEnabled,
    });
    res.redirect(`/clients/${req.params.id}`);
  })
);

app.get(
  '/clients/:id',
  wrapErrors(async (req, res) => {
    const client = await clients.getClient(req.params.id);
    if (!client) return res.status(404).send('Клиент не найден');

    const roundsPage = getPage(req, 'roundsPage');
    const measurementsPage = getPage(req, 'measurementsPage');
    const snapshotsPage = getPage(req, 'snapshotsPage');

    const [
      allGroups,
      allClients,
      clientSnapshots,
      snapshotsTotal,
      surveyRounds,
      surveyRoundsTotal,
      allRounds,
      clientMeasurements,
      measurementsTotal,
    ] = await Promise.all([
      groups.listGroups(),
      clients.listClients({ limit: 500 }),
      snapshots.listSnapshots(client.id, {
        limit: pageSizeFor('snapshots'),
        offset: getOffset(req, 'snapshots', 'snapshotsPage'),
      }),
      snapshots.countSnapshots(client.id),
      clientSurveys.listClientSurveys(client.id, {
        limit: pageSizeFor('clientSurveys'),
        offset: getOffset(req, 'clientSurveys', 'roundsPage'),
      }),
      clientSurveys.countClientSurveys(client.id),
      clientSurveys.listAllCompletedRounds(),
      measurements.listForClient(client.id, {
        limit: pageSizeFor('measurements'),
        offset: getOffset(req, 'measurements', 'measurementsPage'),
      }),
      measurements.countForClient(client.id),
    ]);
    const otherClients = allClients.filter((c) => c.id !== client.id);
    const otherRounds = allRounds.filter((r) => r.client_id !== client.id);

    const body = `
      <h2>#${client.id} — ${escapeHtml(client.name)}</h2>
      ${
        client.deleted_at
          ? `<div class="card" style="border-color:light-dark(#e0b0a0,#5a3a30);">
               <strong>Клиент мягко удалён</strong> <span class="muted">(${fmtDate(client.deleted_at)})</span> — скрыт из основных списков, данные не потеряны.
               <form method="post" action="/clients/${client.id}/restore" style="margin-top:10px">
                 <button type="submit">Восстановить</button>
               </form>
             </div>`
          : ''
      }
      <div class="card">
        <div class="table-wrap">
        <table>
          <tr><th>Город</th><td>${escapeHtml(client.city)}</td></tr>
          <tr><th>Дата рождения</th><td>${escapeHtml(client.birth_date)}</td></tr>
          <tr><th>Telegram</th><td>${client.telegram_username ? '@' + escapeHtml(client.telegram_username) : escapeHtml(client.telegram_id)}</td></tr>
          <tr><th>Статус</th><td><span class="pill">${escapeHtml(client.status)}</span></td></tr>
          <tr><th>Стратегия анкеты</th><td>${escapeHtml(client.survey_strategy || '—')}</td></tr>
          <tr><th>Группа</th><td>
            <form class="inline" method="post" action="/clients/${client.id}/group">
              <select name="groupId">${groupSelectOptions(allGroups, client.group_id, '— без группы —')}</select>
              <button type="submit" class="secondary">Сохранить</button>
            </form>
          </td></tr>
          <tr><th>Хочет план</th><td>${client.wants_plan ? 'да' : 'нет'}</td></tr>
          <tr><th>Создан / обновлён</th><td>${fmtDate(client.created_at)} / ${fmtDate(client.updated_at)}</td></tr>
        </table>
        </div>
      </div>
      <div class="card">
        <h2>Раунды анкеты (${surveyRoundsTotal})</h2>
        <p class="muted">Клиент может проходить анкету заново (/newsurvey в боте) — каждый раз новый раунд, старые не пропадают. Клик по раунду — посмотреть его ответы.</p>
        <div class="table-wrap">
        <table>
          <tr><th>Раунд</th><th>Тип</th><th>Стратегия</th><th>Статус</th><th>Начат</th><th>Завершён</th></tr>
          ${
            surveyRounds
              .map(
                (s) => `<tr>
                  <td><a href="/clients/${client.id}/surveys/${s.round}">#${s.round}</a></td>
                  <td class="muted">${s.kind === 'extend' ? 'расширение' : 'полная'}</td>
                  <td class="muted">${escapeHtml(s.strategy_code || '—')}</td>
                  <td><span class="pill">${s.status === 'completed' ? 'завершён' : 'в процессе'}</span></td>
                  <td class="muted">${fmtDate(s.started_at)}</td>
                  <td class="muted">${s.completed_at ? fmtDate(s.completed_at) : '—'}</td>
                </tr>`
              )
              .join('') || '<tr><td colspan="6" class="muted">Раундов пока нет</td></tr>'
          }
        </table>
        </div>
        ${pagerHtml('clientSurveys', `/clients/${client.id}`, roundsPage, surveyRoundsTotal, 'roundsPage')}
      </div>
      <div class="card">
        <h2>Замеры (${measurementsTotal})</h2>
        <div class="table-wrap">
        <table>
          <tr><th>Дата</th><th>Параметр</th><th>Значение</th></tr>
          ${
            clientMeasurements
              .map(
                (m) => `<tr>
                  <td class="muted">${fmtDate(m.recorded_at)}</td>
                  <td>${escapeHtml(m.type_name)}</td>
                  <td><strong>${m.value}${escapeHtml(m.unit || '')}</strong></td>
                </tr>`
              )
              .join('') || '<tr><td colspan="3" class="muted">Замеров пока нет — клиент вносит сам, /addmeasurement в боте</td></tr>'
          }
        </table>
        </div>
        ${pagerHtml('measurements', `/clients/${client.id}`, measurementsPage, measurementsTotal, 'measurementsPage')}
        <form method="post" action="/clients/${client.id}/measurement-settings" style="margin-top:16px; display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
            <input type="checkbox" name="measurementsEnabled" value="1" ${client.measurements_enabled ? 'checked' : ''} style="width:auto;">
            Замеры разрешены (/addmeasurement, /measurements)
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; margin:0;">
            <input type="checkbox" name="remindersEnabled" value="1" ${client.measurement_reminders_enabled ? 'checked' : ''} style="width:auto;">
            Напоминания раз в 2 недели
          </label>
          <button type="submit" class="secondary">Сохранить</button>
        </form>
      </div>
      <div class="card">
        <h2>Добавить анкету от другого клиента (новым раундом)</h2>
        <p class="muted">Копирует выбранный раунд анкеты другого клиента сюда как новый раунд — существующие раунды этого клиента не трогает и не перезаписывает.</p>
        ${
          otherRounds.length
            ? `<form method="post" action="/clients/${client.id}/append-survey" onsubmit="return confirm('Добавить этот раунд анкеты как новый раунд клиенту #${client.id}?');">
                <select name="source">
                  ${otherRounds
                    .map(
                      (r) =>
                        `<option value="${r.client_id}:${r.round}">${escapeHtml(r.client_name)} — раунд ${r.round} (${r.kind === 'extend' ? 'расширение' : escapeHtml(r.strategy_code || 'full')}, ${fmtDate(r.completed_at)})</option>`
                    )
                    .join('')}
                </select>
                <div class="actions" style="margin-top:12px">
                  <button type="submit" class="secondary">Добавить как новый раунд</button>
                </div>
              </form>`
            : '<p class="muted">У других клиентов пока нет завершённых раундов анкеты.</p>'
        }
      </div>
      <div class="card">
        <h2>Скопировать данные анкеты от другого клиента</h2>
        <p class="muted">Копируется стратегия/статус анкеты и все ответы источника поверх этого клиента. Имя, город, Telegram и группа этого клиента не меняются. Перед копированием текущее состояние автоматически сохраняется в снимок ниже — можно откатить.</p>
        ${
          otherClients.length
            ? `<form method="post" action="/clients/${client.id}/copy-from" onsubmit="return confirm('Перезаписать анкету клиента #${client.id} данными выбранного клиента? Текущее состояние сохранится в снимок и будет доступно для отката.');">
                <select name="sourceId">
                  ${otherClients.map((c) => `<option value="${c.id}">#${c.id} ${escapeHtml(c.name)} (${escapeHtml(c.city)})</option>`).join('')}
                </select>
                <div class="actions" style="margin-top:12px">
                  <button type="submit" class="secondary">Скопировать сюда</button>
                </div>
              </form>`
            : '<p class="muted">Больше клиентов в системе нет.</p>'
        }
      </div>
      <div class="card">
        <h2>Снимки анкеты (${snapshotsTotal})</h2>
        <p class="muted">Снимаются автоматически перед каждым копированием данных другого клиента поверх этого.</p>
        <div class="table-wrap">
        <table>
          <tr><th>Когда</th><th>Причина</th><th>Восстановлен</th><th></th></tr>
          ${
            clientSnapshots
              .map(
                (s) => `<tr>
                  <td class="muted">${fmtDate(s.created_at)}</td>
                  <td>${escapeHtml(s.reason || '—')}</td>
                  <td class="muted">${s.restored_at ? fmtDate(s.restored_at) : '—'}</td>
                  <td>
                    <form method="post" action="/clients/${client.id}/snapshots/${s.id}/restore" onsubmit="return confirm('Восстановить анкету клиента #${client.id} на состояние из этого снимка? Текущие ответы будут заменены.');">
                      <button type="submit" class="secondary">Восстановить</button>
                    </form>
                  </td>
                </tr>`
              )
              .join('') || '<tr><td colspan="4" class="muted">Снимков пока нет</td></tr>'
          }
        </table>
        </div>
        ${pagerHtml('snapshots', `/clients/${client.id}`, snapshotsPage, snapshotsTotal, 'snapshotsPage')}
      </div>
      <div class="card">
        <h2>Удаление</h2>
        <p class="muted">Мягкое удаление — только флаг, данные из базы физически не пропадают, клиента можно восстановить.</p>
        <form method="post" action="/clients/${client.id}/delete" onsubmit="return confirm('Удалить клиента #${client.id}? Это мягкое удаление — данные останутся в базе, можно будет восстановить.');">
          <button type="submit" class="danger">Удалить клиента</button>
        </form>
      </div>`;
    res.send(layout({ title: `Клиент #${client.id}`, active: '/clients', body }));
  })
);

// Ответы одного раунда — отдельный уровень роутинга (не общий список сразу
// всех раундов): у клиента их может накопиться много, показывать всё разом
// плоским списком на карточке клиента не масштабируется.
app.get(
  '/clients/:id/surveys/:round',
  wrapErrors(async (req, res) => {
    const client = await clients.getClient(req.params.id);
    if (!client) return res.status(404).send('Клиент не найден');
    const round = Number(req.params.round);

    const [surveyRound, page, total] = await Promise.all([
      clientSurveys.getSurveyRound(client.id, round),
      Promise.resolve(getPage(req)),
      clients.getAnsweredCount(client.id, round),
    ]);
    if (!surveyRound) return res.status(404).send('Раунд анкеты не найден');

    const answers = await clients.getClientAnswersForRound(client.id, round, {
      limit: pageSizeFor('surveyAnswers'),
      offset: getOffset(req, 'surveyAnswers'),
    });

    const rows = answers
      .map(
        (a) => `<tr>
          <td class="muted">${a.question_number}</td>
          <td>${escapeHtml(a.question_text)}</td>
          <td><strong>${escapeHtml(a.answer_text)}</strong></td>
          <td class="muted">${fmtDate(a.answered_at)}</td>
        </tr>`
      )
      .join('');

    const body = `
      <h2>Клиент <a href="/clients/${client.id}">#${client.id} ${escapeHtml(client.name)}</a> — раунд ${round}</h2>
      <p class="muted">
        ${surveyRound.kind === 'extend' ? 'Расширение' : 'Полная анкета'}
        ${surveyRound.strategy_code ? ` · стратегия ${escapeHtml(surveyRound.strategy_code)}` : ''}
        · <span class="pill">${surveyRound.status === 'completed' ? 'завершён' : 'в процессе'}</span>
        · начат ${fmtDate(surveyRound.started_at)}${surveyRound.completed_at ? `, завершён ${fmtDate(surveyRound.completed_at)}` : ''}
      </p>
      <div class="card">
        <h2>Ответы (${total})</h2>
        <div class="table-wrap">
        <table>
          <tr><th>№</th><th>Вопрос</th><th>Ответ</th><th>Когда</th></tr>
          ${rows || '<tr><td colspan="4" class="muted">Пока нет ответов</td></tr>'}
        </table>
        </div>
        ${pagerHtml('surveyAnswers', `/clients/${client.id}/surveys/${round}`, page, total)}
      </div>`;
    res.send(layout({ title: `#${client.id} — раунд ${round}`, active: '/clients', body }));
  })
);

app.post(
  '/clients/:id/copy-from',
  wrapErrors(async (req, res) => {
    await snapshots.copyClientData(req.body.sourceId, req.params.id, 0);
    res.redirect(`/clients/${req.params.id}`);
  })
);

app.post(
  '/clients/:id/append-survey',
  wrapErrors(async (req, res) => {
    const [sourceClientId, sourceRound] = String(req.body.source || '').split(':');
    if (!sourceClientId || !sourceRound) return res.status(400).send('Не выбран раунд анкеты источника');
    await clientSurveys.copySurveyRoundToClient(sourceClientId, Number(sourceRound), req.params.id);
    res.redirect(`/clients/${req.params.id}`);
  })
);

app.post(
  '/clients/:id/snapshots/:snapshotId/restore',
  wrapErrors(async (req, res) => {
    await snapshots.restoreSnapshot(req.params.snapshotId);
    res.redirect(`/clients/${req.params.id}`);
  })
);

// ---- Вопросы --------------------------------------------------------------

function questionForm({ question, action }) {
  const isEdit = !!question;
  const q = question || { code: '', text: '', type: 'text', options: [], active: true };
  const typeOption = (value, label) =>
    `<option value="${value}"${q.type === value ? ' selected' : ''}>${label}</option>`;

  return `
    <form method="post" action="${action}" class="card">
      <label>Код (уникальный, латиницей, для ссылок в стратегиях)</label>
      <input type="text" name="code" value="${escapeHtml(q.code)}" ${isEdit ? 'readonly' : 'required'}>

      <label>Текст вопроса</label>
      <textarea name="text" required>${escapeHtml(q.text)}</textarea>

      <label>Тип ответа</label>
      <select name="type">
        ${typeOption('text', 'Свободный текст')}
        ${typeOption('choice', 'Варианты кнопками + свой текст')}
        ${typeOption('yesno', 'Да / Нет')}
      </select>

      <label>Варианты кнопками (по одному на строку, только для типа «choice»)</label>
      <textarea name="options" placeholder="Например:&#10;Вариант 1&#10;Вариант 2">${escapeHtml((q.options || []).join('\n'))}</textarea>

      <label><input type="checkbox" name="active" value="1" ${q.active ? 'checked' : ''} style="width:auto"> Активен (используется в анкетах)</label>

      <div class="actions" style="margin-top:16px">
        <button type="submit">${isEdit ? 'Сохранить' : 'Создать вопрос'}</button>
        <a href="/questions"><button type="button" class="secondary">Отмена</button></a>
      </div>
    </form>`;
}

app.get(
  '/questions',
  wrapErrors(async (req, res) => {
    const page = getPage(req);
    const [list, total] = await Promise.all([
      survey.listAllQuestions({ limit: pageSizeFor('questions'), offset: getOffset(req, 'questions') }),
      survey.countAllQuestions(),
    ]);
    const rows = list
      .map(
        (q) => `<tr>
          <td>${escapeHtml(q.code)}</td>
          <td>${escapeHtml(q.type)}</td>
          <td>${q.active ? '<span class="pill">активен</span>' : '<span class="pill muted">отключён</span>'}</td>
          <td>${escapeHtml(q.text)}</td>
          <td><a href="/questions/${q.id}/edit">Изменить</a></td>
        </tr>`
      )
      .join('');

    const body = `
      <h2>Вопросы анкеты (${total})</h2>
      <div class="actions" style="margin-bottom:14px">
        <a href="/questions/new"><button>+ Новый вопрос</button></a>
      </div>
      <div class="card">
        <div class="table-wrap">
        <table>
          <tr><th>Код</th><th>Тип</th><th>Статус</th><th>Текст</th><th></th></tr>
          ${rows}
        </table>
        </div>
        ${pagerHtml('questions', '/questions', page, total)}
      </div>`;
    res.send(layout({ title: 'Вопросы', active: '/questions', body }));
  })
);

app.get('/questions/new', (req, res) => {
  const body = `<h2>Новый вопрос</h2>${questionForm({ question: null, action: '/questions/new' })}`;
  res.send(layout({ title: 'Новый вопрос', active: '/questions', body }));
});

app.post(
  '/questions/new',
  wrapErrors(async (req, res) => {
    const { code, text, type } = req.body;
    const options = (req.body.options || '').split('\n').map((s) => s.trim()).filter(Boolean);
    await survey.createQuestion({ code: code.trim(), text: text.trim(), type, options, active: !!req.body.active });
    res.redirect('/questions');
  })
);

app.get(
  '/questions/:id/edit',
  wrapErrors(async (req, res) => {
    const question = await survey.getQuestionById(req.params.id);
    if (!question) return res.status(404).send('Вопрос не найден');
    const body = `<h2>Вопрос: ${escapeHtml(question.code)}</h2>${questionForm({ question, action: `/questions/${question.id}/edit` })}`;
    res.send(layout({ title: `Вопрос ${question.code}`, active: '/questions', body }));
  })
);

app.post(
  '/questions/:id/edit',
  wrapErrors(async (req, res) => {
    const { text, type } = req.body;
    const options = (req.body.options || '').split('\n').map((s) => s.trim()).filter(Boolean);
    await survey.updateQuestion(req.params.id, { text: text.trim(), type, options, active: !!req.body.active });
    res.redirect('/questions');
  })
);

// ---- Стратегии --------------------------------------------------------------

app.get(
  '/strategies',
  wrapErrors(async (req, res) => {
    const list = await survey.listStrategies();
    const rows = list
      .map(
        (s) => `<tr>
          <td><a href="/strategies/${escapeHtml(s.code)}">${escapeHtml(s.code)}</a></td>
          <td>${escapeHtml(s.name)}</td>
          <td class="col-wrap">${escapeHtml(s.description || '')}</td>
          <td>${s.question_count}</td>
        </tr>`
      )
      .join('');
    const body = `
      <h2>Стратегии анкеты</h2>
      <div class="card">
        <div class="table-wrap">
          <table>
            <tr><th>Код</th><th>Название</th><th>Описание</th><th>Вопросов</th></tr>
            ${rows}
          </table>
        </div>
      </div>`;
    res.send(layout({ title: 'Стратегии', active: '/strategies', body }));
  })
);

const STRATEGY_REFRESH = 'strategy-questions strategy-add';

app.get(
  '/strategies/:code',
  wrapErrors(async (req, res) => {
    const detail = await survey.getStrategyDetail(req.params.code);
    if (!detail) return res.status(404).send('Стратегия не найдена');

    const rows = detail.questions
      .map(
        (q, i) => `<tr>
          <td class="muted">${q.position}</td>
          <td>${escapeHtml(q.code)}</td>
          <td>${escapeHtml(q.type)}${q.active ? '' : ' <span class="pill muted">отключён</span>'}</td>
          <td class="col-wrap">${escapeHtml(q.text)}</td>
          <td class="actions">
            <form class="inline" data-ajax data-refresh="${STRATEGY_REFRESH}" method="post" action="/strategies/${detail.code}/move">
              <input type="hidden" name="questionId" value="${q.id}">
              <input type="hidden" name="direction" value="up">
              <button type="submit" class="secondary" ${i === 0 ? 'disabled' : ''}>▲</button>
            </form>
            <form class="inline" data-ajax data-refresh="${STRATEGY_REFRESH}" method="post" action="/strategies/${detail.code}/move">
              <input type="hidden" name="questionId" value="${q.id}">
              <input type="hidden" name="direction" value="down">
              <button type="submit" class="secondary" ${i === detail.questions.length - 1 ? 'disabled' : ''}>▼</button>
            </form>
            <form class="inline" data-ajax data-refresh="${STRATEGY_REFRESH}" method="post" action="/strategies/${detail.code}/remove">
              <input type="hidden" name="questionId" value="${q.id}">
              <button type="submit" class="icon-danger" title="Убрать из стратегии">✕</button>
            </form>
          </td>
        </tr>`
      )
      .join('');

    const availableOptions = detail.available
      .map((q) => `<option value="${q.id}">${escapeHtml(q.code)} — ${escapeHtml(q.text.slice(0, 60))}</option>`)
      .join('');

    const body = `
      <h2>${escapeHtml(detail.name)} <span class="muted">(${detail.code})</span></h2>
      <p class="muted">${escapeHtml(detail.description || '')}</p>
      <div class="card" id="strategy-questions">
        <div class="table-wrap">
          <table>
            <tr><th>#</th><th>Код</th><th>Тип</th><th>Текст</th><th>Действия</th></tr>
            ${rows || '<tr><td colspan="5" class="muted">Вопросов пока нет</td></tr>'}
          </table>
        </div>
      </div>
      <div class="card" id="strategy-add">
        <h2>Добавить вопрос в стратегию</h2>
        ${
          detail.available.length
            ? `<form data-ajax data-refresh="${STRATEGY_REFRESH}" method="post" action="/strategies/${detail.code}/add">
                <select name="questionId">${availableOptions}</select>
                <div class="actions" style="margin-top:12px">
                  <button type="submit">Добавить (в конец)</button>
                </div>
              </form>`
            : '<p class="muted">Все существующие вопросы уже в этой стратегии. Можно создать новый на странице «Вопросы».</p>'
        }
      </div>`;
    res.send(layout({ title: detail.name, active: '/strategies', body, bodyEnd: AJAX_FORMS_SCRIPT }));
  })
);

app.post(
  '/strategies/:code/add',
  wrapErrors(async (req, res) => {
    await survey.addQuestionToStrategy(req.params.code, req.body.questionId);
    res.redirect(`/strategies/${req.params.code}`);
  })
);

app.post(
  '/strategies/:code/remove',
  wrapErrors(async (req, res) => {
    await survey.removeQuestionFromStrategy(req.params.code, req.body.questionId);
    res.redirect(`/strategies/${req.params.code}`);
  })
);

app.post(
  '/strategies/:code/move',
  wrapErrors(async (req, res) => {
    await survey.moveQuestionInStrategy(req.params.code, req.body.questionId, req.body.direction);
    res.redirect(`/strategies/${req.params.code}`);
  })
);

// ---- Админы (добавление/удаление — только через команды бота) -------------

app.get(
  '/admins',
  wrapErrors(async (req, res) => {
    const page = getPage(req);
    const [list, total, allGroups] = await Promise.all([
      admins.listAdmins({ limit: pageSizeFor('admins'), offset: getOffset(req, 'admins') }),
      admins.countAdmins(),
      groups.listGroups(),
    ]);
    const rows = list
      .map(
        (a) => `<tr>
          <td>${a.role === 'owner' ? '<span class="badge-owner">👑 владелец</span>' : '🛡 админ'}</td>
          <td>${a.telegram_username ? '@' + escapeHtml(a.telegram_username) : '—'}</td>
          <td class="muted">${a.telegram_id}</td>
          <td>${
            a.role === 'owner'
              ? '<span class="muted">все клиенты</span>'
              : `<form class="inline" method="post" action="/admins/${a.telegram_id}/group">
                   <select name="groupId">${groupSelectOptions(allGroups, a.group_id, 'Все клиенты')}</select>
                   <button type="submit" class="secondary">✓</button>
                 </form>`
          }</td>
          <td class="muted">${fmtDate(a.created_at)}</td>
        </tr>`
      )
      .join('');
    const body = `
      <h2>Админы бота (${total})</h2>
      <p class="muted">Добавление/удаление админов — командами в боте (/addadmin, /removeadmin). Область видимости (какую группу клиентов админ видит) можно менять и здесь.</p>
      <div class="card">
        <div class="table-wrap">
        <table>
          <tr><th>Роль</th><th>Username</th><th>Telegram ID</th><th>Область видимости</th><th>Добавлен</th></tr>
          ${rows || '<tr><td colspan="5" class="muted">Пока нет ни одного админа — назначьте владельца через OWNER_TELEGRAM_ID в .env</td></tr>'}
        </table>
        </div>
        ${pagerHtml('admins', '/admins', page, total)}
      </div>`;
    res.send(layout({ title: 'Админы', active: '/admins', body }));
  })
);

app.post(
  '/admins/:telegramId/group',
  wrapErrors(async (req, res) => {
    const groupId = req.body.groupId ? Number(req.body.groupId) : null;
    await admins.setAdminGroup(req.params.telegramId, groupId);
    res.redirect('/admins');
  })
);

// ---- Группы клиентов -------------------------------------------------------

app.get(
  '/groups',
  wrapErrors(async (req, res) => {
    const page = getPage(req);
    const [list, total] = await Promise.all([
      groups.listGroups({ limit: pageSizeFor('groups'), offset: getOffset(req, 'groups') }),
      groups.countGroups(),
    ]);
    const rows = list
      .map(
        (g) =>
          `<tr><td>${escapeHtml(g.code)}</td><td>${escapeHtml(g.name)}</td><td>${g.client_count}</td>` +
          `<td><a href="/groups/${g.id}/edit">Изменить</a></td></tr>`
      )
      .join('');

    const body = `
      <h2>Группы клиентов (${total})</h2>
      <p class="muted">Клиента в группу — на странице «Клиенты» или на карточке клиента. Кто из админов какую группу видит — на странице «Админы».</p>
      <div class="card">
        <div class="table-wrap">
        <table>
          <tr><th>Код</th><th>Название</th><th>Клиентов</th><th></th></tr>
          ${rows || '<tr><td colspan="4" class="muted">Групп пока нет</td></tr>'}
        </table>
        </div>
        ${pagerHtml('groups', '/groups', page, total)}
      </div>
      <div class="card">
        <h2>Новая группа</h2>
        <form method="post" action="/groups/new">
          <label>Код (латиницей, уникальный)</label>
          <input type="text" name="code" required>
          <label>Название</label>
          <input type="text" name="name" required>
          <div class="actions" style="margin-top:16px">
            <button type="submit">Создать</button>
          </div>
        </form>
      </div>`;
    res.send(layout({ title: 'Группы', active: '/groups', body }));
  })
);

app.post(
  '/groups/new',
  wrapErrors(async (req, res) => {
    const code = (req.body.code || '').trim();
    const name = (req.body.name || '').trim();
    if (!code || !name) return res.status(400).send('Нужны и код, и название группы');
    await groups.createGroup(code, name);
    res.redirect('/groups');
  })
);

app.get(
  '/groups/:id/edit',
  wrapErrors(async (req, res) => {
    const group = await groups.getGroupById(req.params.id);
    if (!group) return res.status(404).send('Группа не найдена');

    const body = `
      <h2>Группа: ${escapeHtml(group.name)}</h2>
      <form method="post" action="/groups/${group.id}/edit" class="card">
        <label>Код (не меняется — на него уже могут ссылаться /setclientgroup и /setadmingroup в боте)</label>
        <input type="text" value="${escapeHtml(group.code)}" readonly>
        <label>Название</label>
        <input type="text" name="name" value="${escapeHtml(group.name)}" required>
        <div class="actions" style="margin-top:16px">
          <button type="submit">Сохранить</button>
          <a href="/groups"><button type="button" class="secondary">Отмена</button></a>
        </div>
      </form>`;
    res.send(layout({ title: `Группа ${group.name}`, active: '/groups', body }));
  })
);

app.post(
  '/groups/:id/edit',
  wrapErrors(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).send('Название не может быть пустым');
    await groups.updateGroupName(req.params.id, name);
    res.redirect('/groups');
  })
);

// ---- Журнал правок ответов --------------------------------------------------

app.get(
  '/logs',
  wrapErrors(async (req, res) => {
    const page = getPage(req);
    const [logs, total] = await Promise.all([
      audit.listEditLogs({ limit: pageSizeFor('logs'), offset: getOffset(req, 'logs') }),
      audit.countEditLogs({}),
    ]);
    const rows = logs
      .map(
        (l) => `<tr>
          <td class="muted">${fmtDate(l.edited_at)}</td>
          <td><a href="/clients/${l.client_id}">#${l.client_id} ${escapeHtml(l.client_name)}</a></td>
          <td class="muted">раунд ${l.round}, №${l.question_number}</td>
          <td>${escapeHtml(l.question_text)}</td>
          <td class="muted">${escapeHtml(l.old_answer)}</td>
          <td><strong>${escapeHtml(l.new_answer)}</strong></td>
          <td class="muted">${l.edited_by}</td>
        </tr>`
      )
      .join('');

    const body = `
      <h2>Журнал правок ответов (${total})</h2>
      <p class="muted">Здесь — все правки, сделанные через команду /editanswer в боте.</p>
      <div class="card">
        <div class="table-wrap">
        <table>
          <tr><th>Когда</th><th>Клиент</th><th>Вопрос</th><th>Текст вопроса</th><th>Было</th><th>Стало</th><th>Кто правил (Telegram ID)</th></tr>
          ${rows || '<tr><td colspan="7" class="muted">Правок пока нет</td></tr>'}
        </table>
        </div>
        ${pagerHtml('logs', '/logs', page, total)}
      </div>`;
    res.send(layout({ title: 'Логи', active: '/logs', body }));
  })
);

// ---- Залы и оборудование ----------------------------------------------------

app.get(
  '/gyms',
  wrapErrors(async (req, res) => {
    const deletedOnly = req.query.deleted === '1';
    const page = getPage(req);
    const [list, total] = await Promise.all([
      gyms.listGyms({ deletedOnly, limit: pageSizeFor('gyms'), offset: getOffset(req, 'gyms') }),
      gyms.countGyms({ deletedOnly }),
    ]);
    const rows = list
      .map(
        (g) => `<tr>
          <td><a href="/gyms/${g.id}">#${g.id} ${escapeHtml(g.name)}</a></td>
          <td>${g.type === 'template' ? '<span class="pill">типовой</span>' : escapeHtml(g.location || '—')}</td>
          <td>${g.equipment_count}</td>
          <td class="muted">${fmtDate(deletedOnly ? g.deleted_at : g.created_at)}</td>
          <td>
            ${
              deletedOnly
                ? `<form method="post" action="/gyms/${g.id}/restore">
                     <button type="submit" class="secondary">Восстановить</button>
                   </form>`
                : `<form method="post" action="/gyms/${g.id}/delete" onsubmit="return confirm('Удалить зал #${g.id} ${escapeHtml(g.name).replace(/'/g, '')}? Это мягкое удаление — оборудование и фото в MinIO останутся, можно будет восстановить.');">
                     <button type="submit" class="icon-danger" title="Удалить зал">✕</button>
                   </form>`
            }
          </td>
        </tr>`
      )
      .join('');

    const baseUrl = deletedOnly ? '/gyms?deleted=1' : '/gyms';
    const body = `
      <h2>${deletedOnly ? 'Удалённые залы' : 'Залы'} (${total})</h2>
      <p class="muted">
        ${deletedOnly ? 'Мягко удалённые — оборудование и фото сохранены, можно восстановить.' : ''}
        <a href="/gyms${deletedOnly ? '' : '?deleted=1'}">${deletedOnly ? '← К активным залам' : 'Удалённые →'}</a>
      </p>
      <div class="card">
        <div class="table-wrap">
        <table>
          <tr><th>Зал</th><th>Локация</th><th>Оборудования</th><th>${deletedOnly ? 'Удалён' : 'Создан'}</th><th></th></tr>
          ${rows || `<tr><td colspan="5" class="muted">${deletedOnly ? 'Удалённых залов нет' : 'Залов пока нет — заводятся командой /creategym в боте'}</td></tr>`}
        </table>
        </div>
        ${pagerHtml('gyms', baseUrl, page, total)}
      </div>
      ${deletedOnly ? '' : '<p class="muted">Заводить залы и добавлять фото оборудования — через бота (/creategym, /addequipment). Здесь можно смотреть и классифицировать.</p>'}`;
    res.send(layout({ title: deletedOnly ? 'Удалённые залы' : 'Залы', active: '/gyms', body }));
  })
);

app.post(
  '/gyms/:id/delete',
  wrapErrors(async (req, res) => {
    // Мягкое удаление — MinIO не трогаем, чтобы восстановление вернуло зал в точности как было.
    await gyms.deleteGym(req.params.id);
    res.redirect('/gyms');
  })
);

app.post(
  '/gyms/:id/restore',
  wrapErrors(async (req, res) => {
    await gyms.restoreGym(req.params.id);
    res.redirect(req.get('Referer') && req.get('Referer').includes('deleted=1') ? '/gyms?deleted=1' : `/gyms/${req.params.id}`);
  })
);

const LIGHTGALLERY_VERSION = '2.9.0';
const LIGHTGALLERY_HEAD = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lightgallery@${LIGHTGALLERY_VERSION}/css/lightgallery-bundle.min.css">
<script src="https://cdn.jsdelivr.net/npm/lightgallery@${LIGHTGALLERY_VERSION}/lightgallery.umd.js"></script>
<style>
  .equipment-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .thumb {
    display: block; border-radius: 10px; overflow: hidden; cursor: zoom-in;
    border: 1px solid light-dark(#e6e3da, #262c27); background: light-dark(#fff, #191f1b);
  }
  .thumb img { width: 100%; height: 120px; object-fit: cover; display: block; }
  .thumb-label {
    display: block; padding: 6px 8px; font-size: 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .gallery-toolbar { display: flex; gap: 8px; margin-bottom: 14px; }
  .gallery-toolbar button.active { background: light-dark(#146c4c, #3fd8a3); color: light-dark(#fff, #0d1a15); }
  .lg-caption { color: #fff; font-size: 14px; padding: 10px 4px; }
  .lg-edit { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 4px; }
  .lg-edit select, .lg-edit input { width: auto; min-width: 160px; }
  .lg-save-status { color: #9be3c0; font-size: 12px; }
</style>`;

app.get(
  '/gyms/:id',
  wrapErrors(async (req, res) => {
    const gym = await gyms.getGym(req.params.id);
    if (!gym) return res.status(404).send('Зал не найден');

    const page = getPage(req);
    const [items, itemsTotal, allClasses] = await Promise.all([
      equipment.listGymEquipment(gym.id, { limit: pageSizeFor('gymEquipment'), offset: getOffset(req, 'gymEquipment') }),
      equipment.countGymEquipment(gym.id),
      equipment.listClasses(),
    ]);

    const thumbs = items
      .map(
        (e, index) => `
        <a href="#" class="thumb" data-index="${index}">
          <img src="/gyms/${gym.id}/equipment/${e.id}/photo" alt="Фото оборудования #${e.id}" loading="lazy">
          <span class="thumb-label" data-id="${e.id}">${escapeHtml(e.name || '(без названия)')}</span>
        </a>`
      )
      .join('');

    const equipmentData = items.map((e) => ({
      id: e.id,
      photo: `/gyms/${gym.id}/equipment/${e.id}/photo`,
      name: e.name || '',
      classId: e.equipment_class_id || '',
      className: e.class_name || '',
    }));
    const classList = allClasses.map((c) => ({ id: c.id, name: c.name }));
    // </script> в данных сломал бы разметку — экранируем "<" на всякий случай.
    const jsonSafe = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

    const body = `
      <h2>${escapeHtml(gym.name)} <span class="muted">(#${gym.id})</span></h2>
      ${
        gym.deleted_at
          ? `<div class="card" style="border-color:light-dark(#e0b0a0,#5a3a30);">
               <strong>Зал мягко удалён</strong> <span class="muted">(${fmtDate(gym.deleted_at)})</span> — скрыт из основных списков, оборудование и фото сохранены.
               <form method="post" action="/gyms/${gym.id}/restore" style="margin-top:10px">
                 <button type="submit">Восстановить</button>
               </form>
             </div>`
          : ''
      }
      <p class="muted">${gym.type === 'template' ? 'Типовой набор оборудования' : `Локация: ${escapeHtml(gym.location || '—')}`}</p>
      <h2>Оборудование (${itemsTotal})</h2>
      ${
        items.length
          ? `<div class="gallery-toolbar">
               <button type="button" id="mode-view" class="secondary active">🖼 Просмотр</button>
               <button type="button" id="mode-edit" class="secondary">✏️ Просмотр с редактированием</button>
             </div>
             <div class="equipment-grid" id="equipment-grid">${thumbs}</div>
             ${pagerHtml('gymEquipment', `/gyms/${gym.id}`, page, itemsTotal)}`
          : `<div class="card muted">Фото пока нет — добавляются командой /addequipment ${gym.id} в боте или скриптом import_media.</div>`
      }
      ${
        gym.deleted_at
          ? ''
          : `<div class="card">
               <h2>Удаление</h2>
               <p class="muted">Мягкое удаление — только флаг, оборудование и фото в MinIO не трогаются, зал можно восстановить.</p>
               <form method="post" action="/gyms/${gym.id}/delete" onsubmit="return confirm('Удалить зал #${gym.id}? Это мягкое удаление — можно будет восстановить.');">
                 <button type="submit" class="danger">Удалить зал</button>
               </form>
             </div>`
      }`;

    const bodyEnd = items.length
      ? `<script>
(function () {
  var GYM_ID = ${gym.id};
  var equipmentData = ${jsonSafe(equipmentData)};
  var classes = ${jsonSafe(classList)};
  var mode = 'view';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function classOptionsHtml(selectedId) {
    var html = '<option value="">— без класса —</option>';
    classes.forEach(function (c) {
      html += '<option value="' + c.id + '"' + (String(selectedId) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    });
    return html;
  }

  function subHtmlFor(item) {
    if (mode !== 'edit') {
      return '<div class="lg-caption">#' + item.id + ' ' + esc(item.name || '(без названия)') +
        (item.className ? ' — ' + esc(item.className) : ' — не классифицировано') + '</div>';
    }
    return '<div class="lg-edit" data-id="' + item.id + '">' +
      '<select class="lg-class-select">' + classOptionsHtml(item.classId) + '</select>' +
      '<input type="text" class="lg-name-input" value="' + esc(item.name) + '" placeholder="Название">' +
      '<button type="button" class="lg-save-btn">Сохранить</button>' +
      '<span class="lg-save-status"></span>' +
      '</div>';
  }

  function buildDynamicEl() {
    return equipmentData.map(function (item) {
      return { src: item.photo, thumb: item.photo, subHtml: subHtmlFor(item) };
    });
  }

  // Пустой элемент-заглушка — при dynamic:true lightGallery не читает детей
  // контейнера, но ему всё равно нужен DOM-узел для навешивания обработчиков.
  var galleryEl = document.createElement('div');
  document.body.appendChild(galleryEl);
  var gallery = null;

  function openGallery(index) {
    if (gallery) gallery.destroy(true);
    // licenseKey не задан — для GPLv3/внутреннего некоммерческого использования
    // это ожидаемо и не мешает работе, lightGallery просто пишет предупреждение в консоль.
    gallery = lightGallery(galleryEl, { dynamic: true, dynamicEl: buildDynamicEl() });
    gallery.openGallery(index || 0);
  }

  document.querySelectorAll('.thumb').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      openGallery(Number(el.getAttribute('data-index')) || 0);
    });
  });

  document.getElementById('mode-view').addEventListener('click', function () {
    mode = 'view';
    document.getElementById('mode-view').classList.add('active');
    document.getElementById('mode-edit').classList.remove('active');
  });
  document.getElementById('mode-edit').addEventListener('click', function () {
    mode = 'edit';
    document.getElementById('mode-edit').classList.add('active');
    document.getElementById('mode-view').classList.remove('active');
  });

  document.addEventListener('click', function (e) {
    if (!e.target.classList || !e.target.classList.contains('lg-save-btn')) return;
    var container = e.target.closest('.lg-edit');
    var id = container.getAttribute('data-id');
    var classId = container.querySelector('.lg-class-select').value;
    var name = container.querySelector('.lg-name-input').value;
    var status = container.querySelector('.lg-save-status');
    status.textContent = 'Сохраняю…';

    fetch('/gyms/' + GYM_ID + '/equipment/' + id + '/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'classId=' + encodeURIComponent(classId) + '&name=' + encodeURIComponent(name),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        var item = equipmentData.find(function (x) { return String(x.id) === String(id); });
        if (item) {
          item.name = name;
          item.classId = classId;
          var cls = classes.find(function (c) { return String(c.id) === String(classId); });
          item.className = cls ? cls.name : '';
          var label = document.querySelector('.thumb-label[data-id="' + id + '"]');
          if (label) label.textContent = name || '(без названия)';
        }
        status.textContent = 'Сохранено ✓';
        setTimeout(function () { status.textContent = ''; }, 1500);
      })
      .catch(function () {
        status.textContent = 'Ошибка сохранения';
      });
  });
})();
</script>`
      : '';

    res.send(layout({ title: gym.name, active: '/gyms', body, extraHead: LIGHTGALLERY_HEAD, bodyEnd }));
  })
);

app.post(
  '/gyms/:gymId/equipment/:id/classify',
  wrapErrors(async (req, res) => {
    const classId = req.body.classId ? Number(req.body.classId) : null;
    await equipment.classify(req.params.id, classId, req.body.name ? req.body.name.trim() : null);
    res.redirect(`/gyms/${req.params.gymId}`);
  })
);

// Фото сначала ищем в MinIO (постоянная копия, gym_media) — это быстрее и не
// зависит от Telegram. Если копии ещё нет (старое фото, MinIO был недоступен
// в момент загрузки) — откатываемся на прокси через Telegram getFileLink; сам
// файл в HTML не отдаём напрямую, там был бы токен бота открытым текстом.
app.get(
  '/gyms/:gymId/equipment/:id/photo',
  wrapErrors(async (req, res) => {
    const item = await equipment.getEquipment(req.params.id);
    if (!item || String(item.gym_id) !== req.params.gymId) return res.status(404).send('Не найдено');

    const mediaRow = await media.getMediaForEquipment(item.id);
    if (mediaRow) {
      try {
        const stream = await media.streamObject(mediaRow.minio_key);
        res.set('Content-Type', mediaRow.content_type || 'image/jpeg');
        res.set('Cache-Control', 'private, max-age=3600');
        return stream.pipe(res);
      } catch (err) {
        console.error(`Не удалось прочитать объект ${mediaRow.minio_key} из MinIO:`, err.message);
        // падаем на Telegram ниже
      }
    }

    if (!item.photo_file_id) return res.status(404).send('Фото недоступно (нет ни MinIO-копии, ни Telegram file_id)');
    if (!telegram) return res.status(503).send('Ни MinIO, ни BOT_TOKEN не настроены — фото недоступно');

    let fileLink;
    try {
      fileLink = await telegram.getFileLink(item.photo_file_id);
    } catch (err) {
      console.error(`Не удалось получить file_id ${item.photo_file_id} у Telegram:`, err.message);
      return res.status(502).send('Telegram не отдал файл (возможно, устаревший file_id)');
    }

    const upstream = await fetch(fileLink.href || fileLink.toString());
    if (!upstream.ok) return res.status(502).send('Не удалось получить фото из Telegram');

    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  })
);

// ---- Классы оборудования ----------------------------------------------------

app.get(
  '/classes',
  wrapErrors(async (req, res) => {
    const page = getPage(req);
    const [list, total] = await Promise.all([
      equipment.listClasses({ limit: pageSizeFor('classes'), offset: getOffset(req, 'classes') }),
      equipment.countClasses(),
    ]);
    const rows = list
      .map(
        (c) => `<tr><td>${escapeHtml(c.code)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.description || '')}</td></tr>`
      )
      .join('');

    const body = `
      <h2>Классы оборудования (${total})</h2>
      <p class="muted">Справочник — одно и то же оборудование бывает в разных залах, класс у него общий.</p>
      <div class="card">
        <div class="table-wrap">
        <table>
          <tr><th>Код</th><th>Название</th><th>Описание</th></tr>
          ${rows || '<tr><td colspan="3" class="muted">Классов пока нет</td></tr>'}
        </table>
        </div>
        ${pagerHtml('classes', '/classes', page, total)}
      </div>
      <div class="card">
        <h2>Новый класс</h2>
        <form method="post" action="/classes/new">
          <label>Код (латиницей, уникальный)</label>
          <input type="text" name="code" required>
          <label>Название</label>
          <input type="text" name="name" required>
          <label>Описание (необязательно)</label>
          <input type="text" name="description">
          <div class="actions" style="margin-top:16px">
            <button type="submit">Создать</button>
          </div>
        </form>
      </div>`;
    res.send(layout({ title: 'Классы оборудования', active: '/classes', body }));
  })
);

app.post(
  '/classes/new',
  wrapErrors(async (req, res) => {
    const code = (req.body.code || '').trim();
    const name = (req.body.name || '').trim();
    if (!code || !name) return res.status(400).send('Нужны и код, и название класса');
    await equipment.createClass(code, name, (req.body.description || '').trim() || null);
    res.redirect('/classes');
  })
);

// ---- Меню бота (кнопка со списком команд, по ролям) ------------------------

const MENU_TIERS = [
  ['client', 'Всем (клиенты, админы, владелец)'],
  ['admin', '+ Админам и владельцу'],
  ['owner', '+ Только владельцу'],
];

function menuTierSection(tier, label, commands) {
  const rows = commands
    .map(
      (c) => `<tr>
        <td><code>/${escapeHtml(c.command)}</code></td>
        <td colspan="3">
          <form class="inline" data-ajax method="post" action="/menu/${c.id}/edit" style="width:100%; flex-wrap:wrap;">
            <input type="text" name="description" value="${escapeHtml(c.description)}" style="flex:1; min-width:160px;">
            <input type="number" name="position" value="${c.position}" style="width:70px;" title="Порядок">
            <label style="display:inline-flex; align-items:center; gap:4px; margin:0;">
              <input type="checkbox" name="active" value="1" ${c.active ? 'checked' : ''} style="width:auto;"> активна
            </label>
            <button type="submit" class="secondary">Сохранить</button>
          </form>
        </td>
        <td>
          <form data-ajax data-confirm="Убрать /${escapeHtml(c.command)} из меню ${escapeHtml(label)}?" data-remove-row="tr" method="post" action="/menu/${c.id}/delete">
            <button type="submit" class="icon-danger" title="Убрать из меню">✕</button>
          </form>
        </td>
      </tr>`
    )
    .join('');

  return `
    <div class="card" id="menu-tier-${tier}">
      <h2>${escapeHtml(label)}</h2>
      <div class="table-wrap">
        <table>
          <tr><th>Команда</th><th colspan="3">Описание / порядок / активна</th><th></th></tr>
          ${rows || '<tr><td colspan="5" class="muted">Команд пока нет</td></tr>'}
        </table>
      </div>
      <form data-ajax data-refresh="menu-tier-${tier}" method="post" action="/menu/new" style="margin-top:16px; display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
        <input type="hidden" name="tier" value="${tier}">
        <div>
          <label>Команда (без /)</label>
          <input type="text" name="command" placeholder="mycommand" style="width:160px;" required>
        </div>
        <div style="flex:1; min-width:160px;">
          <label>Описание</label>
          <input type="text" name="description" placeholder="Что делает" required>
        </div>
        <div>
          <label>Порядок</label>
          <input type="number" name="position" value="0" style="width:70px;">
        </div>
        <button type="submit">+ Добавить</button>
      </form>
    </div>`;
}

app.get(
  '/menu',
  wrapErrors(async (req, res) => {
    const all = await menuConfig.listAllCommands();
    const byTier = { client: [], admin: [], owner: [] };
    all.forEach((c) => byTier[c.tier].push(c));

    const body = `
      <h2>Меню бота</h2>
      <p class="muted">
        Что видит каждый тип учётки в кнопке меню Telegram. Владелец получает «Всем» + «Админам» + «Владельцу»,
        админ — «Всем» + «Админам», клиент — только «Всем». Изменения тут не создают и не удаляют сами команды
        бота (обработчики в коде) — только то, что показывается в меню; если команды не существует в коде,
        она в меню будет, но ничего не сделает при нажатии.
      </p>
      <form data-ajax data-success-text="Применено ✓" method="post" action="/menu/apply" style="margin-bottom:20px">
        <button type="submit">🔄 Применить сейчас (обновить меню у всех в Telegram)</button>
      </form>
      ${MENU_TIERS.map(([tier, label]) => menuTierSection(tier, label, byTier[tier])).join('')}`;
    res.send(layout({ title: 'Меню бота', active: '/menu', body, bodyEnd: AJAX_FORMS_SCRIPT }));
  })
);

app.post(
  '/menu/new',
  wrapErrors(async (req, res) => {
    const command = (req.body.command || '').trim();
    const description = (req.body.description || '').trim();
    if (!command || !description) return res.status(400).send('Нужны и команда, и описание');
    await menuConfig.createCommand({
      tier: req.body.tier,
      command,
      description,
      position: Number(req.body.position) || 0,
    });
    res.redirect('/menu');
  })
);

app.post(
  '/menu/:id/edit',
  wrapErrors(async (req, res) => {
    await menuConfig.updateCommand(req.params.id, {
      description: (req.body.description || '').trim(),
      position: Number(req.body.position) || 0,
      active: !!req.body.active,
    });
    res.redirect('/menu');
  })
);

app.post(
  '/menu/:id/delete',
  wrapErrors(async (req, res) => {
    await menuConfig.deleteCommand(req.params.id);
    res.redirect('/menu');
  })
);

app.post(
  '/menu/apply',
  wrapErrors(async (req, res) => {
    if (!telegram) return res.status(503).send('BOT_TOKEN не настроен — некому применять меню');
    await setDefaultMenu(telegram);
    await syncAllAdminMenus(telegram);
    res.redirect('/menu');
  })
);

app.use((err, req, res, next) => {
  console.error('Ошибка веб-админки:', err);
  res.status(500).send('Внутренняя ошибка. Подробности — в логах сервера.');
});

app.listen(ADMIN_WEB.port, () => {
  console.log(`Веб-админка запущена на порту ${ADMIN_WEB.port}`);
});
