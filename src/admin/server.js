// Веб-админка: список клиентов/анкет и редактирование вопросов анкеты без
// прямых SQL-запросов. Отдельный процесс от бота (свой npm-скрипт, свой сервис
// в docker-compose.yml), общая с ботом БД через src/*.
const express = require('express');
const { Telegraf } = require('telegraf');
const { ADMIN_WEB, BOT_TOKEN } = require('../config');
const { escapeHtml, layout } = require('./html');
const clients = require('../clients');
const survey = require('../survey');
const admins = require('../admins');
const groups = require('../groups');
const audit = require('../audit');
const gyms = require('../gyms');
const equipment = require('../equipment');

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
        <table>
          <tr><th>Код</th><th>Название</th><th>Вопросов</th></tr>
          ${strategies
            .map(
              (s) =>
                `<tr><td><a href="/strategies/${escapeHtml(s.code)}">${escapeHtml(s.code)}</a></td><td>${escapeHtml(s.name)}</td><td>${s.question_count}</td></tr>`
            )
            .join('')}
        </table>
      </div>`;
    res.send(layout({ title: 'Дашборд', active: '/', body }));
  })
);

// ---- Клиенты ------------------------------------------------------------

app.get(
  '/clients',
  wrapErrors(async (req, res) => {
    const [list, allGroups] = await Promise.all([clients.listClients({ limit: 200 }), groups.listGroups()]);
    const rows = list
      .map(
        (c) => `<tr>
          <td><a href="/clients/${c.id}">#${c.id}</a></td>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.city)}</td>
          <td><span class="pill">${escapeHtml(c.status)}</span></td>
          <td>${escapeHtml(c.survey_strategy || '—')}</td>
          <td>
            <form class="inline" method="post" action="/clients/${c.id}/group">
              <select name="groupId">${groupSelectOptions(allGroups, c.group_id, '— без группы —')}</select>
              <button type="submit" class="secondary">✓</button>
            </form>
          </td>
          <td>${c.wants_plan ? 'да' : 'нет'}</td>
          <td class="muted">${fmtDate(c.created_at)}</td>
        </tr>`
      )
      .join('');

    const body = `
      <h2>Клиенты (${list.length})</h2>
      <div class="card">
        <table>
          <tr><th>ID</th><th>Имя</th><th>Город</th><th>Статус</th><th>Стратегия</th><th>Группа</th><th>Хочет план</th><th>Создан</th></tr>
          ${rows || '<tr><td colspan="8" class="muted">Клиентов пока нет</td></tr>'}
        </table>
      </div>`;
    res.send(layout({ title: 'Клиенты', active: '/clients', body }));
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

app.get(
  '/clients/:id',
  wrapErrors(async (req, res) => {
    const client = await clients.getClient(req.params.id);
    if (!client) return res.status(404).send('Клиент не найден');
    const [answers, allGroups] = await Promise.all([clients.getClientAnswers(client.id), groups.listGroups()]);

    const answerRows = answers
      .map(
        (a) => `<tr>
          <td class="muted">${a.round}</td>
          <td class="muted">${a.question_number}</td>
          <td>${escapeHtml(a.question_text)}</td>
          <td><strong>${escapeHtml(a.answer_text)}</strong></td>
          <td class="muted">${fmtDate(a.answered_at)}</td>
        </tr>`
      )
      .join('');

    const body = `
      <h2>#${client.id} — ${escapeHtml(client.name)}</h2>
      <div class="card">
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
      <div class="card">
        <h2>Ответы на анкету (${answers.length})</h2>
        <table>
          <tr><th>Раунд</th><th>№</th><th>Вопрос</th><th>Ответ</th><th>Когда</th></tr>
          ${answerRows || '<tr><td colspan="5" class="muted">Пока нет ответов</td></tr>'}
        </table>
      </div>`;
    res.send(layout({ title: `Клиент #${client.id}`, active: '/clients', body }));
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
    const list = await survey.listAllQuestions();
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
      <h2>Вопросы анкеты (${list.length})</h2>
      <div class="actions" style="margin-bottom:14px">
        <a href="/questions/new"><button>+ Новый вопрос</button></a>
      </div>
      <div class="card">
        <table>
          <tr><th>Код</th><th>Тип</th><th>Статус</th><th>Текст</th><th></th></tr>
          ${rows}
        </table>
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
          <td>${escapeHtml(s.description || '')}</td>
          <td>${s.question_count}</td>
        </tr>`
      )
      .join('');
    const body = `
      <h2>Стратегии анкеты</h2>
      <div class="card">
        <table>
          <tr><th>Код</th><th>Название</th><th>Описание</th><th>Вопросов</th></tr>
          ${rows}
        </table>
      </div>`;
    res.send(layout({ title: 'Стратегии', active: '/strategies', body }));
  })
);

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
          <td>${escapeHtml(q.text)}</td>
          <td class="actions">
            <form class="inline" method="post" action="/strategies/${detail.code}/move">
              <input type="hidden" name="questionId" value="${q.id}">
              <input type="hidden" name="direction" value="up">
              <button type="submit" class="secondary" ${i === 0 ? 'disabled' : ''}>▲</button>
            </form>
            <form class="inline" method="post" action="/strategies/${detail.code}/move">
              <input type="hidden" name="questionId" value="${q.id}">
              <input type="hidden" name="direction" value="down">
              <button type="submit" class="secondary" ${i === detail.questions.length - 1 ? 'disabled' : ''}>▼</button>
            </form>
            <form class="inline" method="post" action="/strategies/${detail.code}/remove">
              <input type="hidden" name="questionId" value="${q.id}">
              <button type="submit" class="danger">Убрать</button>
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
      <div class="card">
        <table>
          <tr><th>#</th><th>Код</th><th>Тип</th><th>Текст</th><th>Действия</th></tr>
          ${rows || '<tr><td colspan="5" class="muted">Вопросов пока нет</td></tr>'}
        </table>
      </div>
      <div class="card">
        <h2>Добавить вопрос в стратегию</h2>
        ${
          detail.available.length
            ? `<form method="post" action="/strategies/${detail.code}/add">
                <select name="questionId">${availableOptions}</select>
                <div class="actions" style="margin-top:12px">
                  <button type="submit">Добавить (в конец)</button>
                </div>
              </form>`
            : '<p class="muted">Все существующие вопросы уже в этой стратегии. Можно создать новый на странице «Вопросы».</p>'
        }
      </div>`;
    res.send(layout({ title: detail.name, active: '/strategies', body }));
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
    const [list, allGroups] = await Promise.all([admins.listAdmins(), groups.listGroups()]);
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
      <h2>Админы бота</h2>
      <p class="muted">Добавление/удаление админов — командами в боте (/addadmin, /removeadmin). Область видимости (какую группу клиентов админ видит) можно менять и здесь.</p>
      <div class="card">
        <table>
          <tr><th>Роль</th><th>Username</th><th>Telegram ID</th><th>Область видимости</th><th>Добавлен</th></tr>
          ${rows || '<tr><td colspan="5" class="muted">Пока нет ни одного админа — назначьте владельца через OWNER_TELEGRAM_ID в .env</td></tr>'}
        </table>
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
    const list = await groups.listGroups();
    const rows = list
      .map((g) => `<tr><td>${escapeHtml(g.code)}</td><td>${escapeHtml(g.name)}</td><td>${g.client_count}</td></tr>`)
      .join('');

    const body = `
      <h2>Группы клиентов (${list.length})</h2>
      <p class="muted">Клиента в группу — на странице «Клиенты» или на карточке клиента. Кто из админов какую группу видит — на странице «Админы».</p>
      <div class="card">
        <table>
          <tr><th>Код</th><th>Название</th><th>Клиентов</th></tr>
          ${rows || '<tr><td colspan="3" class="muted">Групп пока нет</td></tr>'}
        </table>
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

// ---- Журнал правок ответов --------------------------------------------------

app.get(
  '/logs',
  wrapErrors(async (req, res) => {
    const logs = await audit.listEditLogs({ limit: 100 });
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
      <h2>Журнал правок ответов (последние ${logs.length})</h2>
      <p class="muted">Здесь — все правки, сделанные через команду /editanswer в боте.</p>
      <div class="card">
        <table>
          <tr><th>Когда</th><th>Клиент</th><th>Вопрос</th><th>Текст вопроса</th><th>Было</th><th>Стало</th><th>Кто правил (Telegram ID)</th></tr>
          ${rows || '<tr><td colspan="7" class="muted">Правок пока нет</td></tr>'}
        </table>
      </div>`;
    res.send(layout({ title: 'Логи', active: '/logs', body }));
  })
);

// ---- Залы и оборудование ----------------------------------------------------

app.get(
  '/gyms',
  wrapErrors(async (req, res) => {
    const list = await gyms.listGyms();
    const rows = list
      .map(
        (g) => `<tr>
          <td><a href="/gyms/${g.id}">#${g.id} ${escapeHtml(g.name)}</a></td>
          <td>${g.type === 'template' ? '<span class="pill">типовой</span>' : escapeHtml(g.location || '—')}</td>
          <td>${g.equipment_count}</td>
          <td class="muted">${fmtDate(g.created_at)}</td>
        </tr>`
      )
      .join('');

    const body = `
      <h2>Залы (${list.length})</h2>
      <div class="card">
        <table>
          <tr><th>Зал</th><th>Локация</th><th>Оборудования</th><th>Создан</th></tr>
          ${rows || '<tr><td colspan="4" class="muted">Залов пока нет — заводятся командой /creategym в боте</td></tr>'}
        </table>
      </div>
      <p class="muted">Заводить залы и добавлять фото оборудования — через бота (/creategym, /addequipment). Здесь можно смотреть и классифицировать.</p>`;
    res.send(layout({ title: 'Залы', active: '/gyms', body }));
  })
);

app.get(
  '/gyms/:id',
  wrapErrors(async (req, res) => {
    const gym = await gyms.getGym(req.params.id);
    if (!gym) return res.status(404).send('Зал не найден');

    const [items, allClasses] = await Promise.all([equipment.listGymEquipment(gym.id), equipment.listClasses()]);

    const classOptions = (selectedClassId) =>
      `<option value="">— без класса —</option>` +
      allClasses
        .map(
          (c) =>
            `<option value="${c.id}"${String(selectedClassId) === String(c.id) ? ' selected' : ''}>${escapeHtml(c.name)}</option>`
        )
        .join('');

    const cards = items
      .map(
        (e) => `
        <div class="card" style="display:flex; gap:16px; align-items:flex-start;">
          <img src="/gyms/${gym.id}/equipment/${e.id}/photo" alt="Фото оборудования #${e.id}"
               style="width:160px; height:160px; object-fit:cover; border-radius:8px; flex-shrink:0;">
          <div style="flex:1; min-width:0;">
            <div><strong>#${e.id} ${escapeHtml(e.name || '(без названия)')}</strong></div>
            <div class="muted" style="margin:4px 0 12px;">
              ${e.class_name ? `Класс: ${escapeHtml(e.class_name)}` : 'Не классифицировано'} · добавлено ${fmtDate(e.created_at)}
            </div>
            <form method="post" action="/gyms/${gym.id}/equipment/${e.id}/classify" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <select name="classId" style="width:auto;">${classOptions(e.equipment_class_id)}</select>
              <input type="text" name="name" placeholder="Название" value="${escapeHtml(e.name || '')}" style="width:180px;">
              <button type="submit" class="secondary">Сохранить</button>
            </form>
          </div>
        </div>`
      )
      .join('');

    const body = `
      <h2>${escapeHtml(gym.name)} <span class="muted">(#${gym.id})</span></h2>
      <p class="muted">${gym.type === 'template' ? 'Типовой набор оборудования' : `Локация: ${escapeHtml(gym.location || '—')}`}</p>
      <h2>Оборудование (${items.length})</h2>
      ${cards || '<div class="card muted">Фото пока нет — добавляются командой /addequipment ' + gym.id + ' в боте.</div>'}`;
    res.send(layout({ title: gym.name, active: '/gyms', body }));
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

// Фото хранится в Telegram, не у нас — сервер проксирует байты через себя,
// чтобы не отдавать в HTML прямую ссылку с токеном бота (getFileLink его содержит).
app.get(
  '/gyms/:gymId/equipment/:id/photo',
  wrapErrors(async (req, res) => {
    if (!telegram) return res.status(503).send('BOT_TOKEN не настроен — фото недоступны');

    const item = await equipment.getEquipment(req.params.id);
    if (!item || String(item.gym_id) !== req.params.gymId) return res.status(404).send('Не найдено');

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
    const list = await equipment.listClasses();
    const rows = list
      .map(
        (c) => `<tr><td>${escapeHtml(c.code)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.description || '')}</td></tr>`
      )
      .join('');

    const body = `
      <h2>Классы оборудования (${list.length})</h2>
      <p class="muted">Справочник — одно и то же оборудование бывает в разных залах, класс у него общий.</p>
      <div class="card">
        <table>
          <tr><th>Код</th><th>Название</th><th>Описание</th></tr>
          ${rows || '<tr><td colspan="3" class="muted">Классов пока нет</td></tr>'}
        </table>
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

app.use((err, req, res, next) => {
  console.error('Ошибка веб-админки:', err);
  res.status(500).send('Внутренняя ошибка. Подробности — в логах сервера.');
});

app.listen(ADMIN_WEB.port, () => {
  console.log(`Веб-админка запущена на порту ${ADMIN_WEB.port}`);
});
