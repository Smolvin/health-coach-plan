// Веб-админка: список клиентов/анкет и редактирование вопросов анкеты без
// прямых SQL-запросов. Отдельный процесс от бота (свой npm-скрипт, свой сервис
// в docker-compose.yml), общая с ботом БД через src/*.
const express = require('express');
const { ADMIN_WEB } = require('../config');
const { escapeHtml, layout } = require('./html');
const clients = require('../clients');
const survey = require('../survey');
const admins = require('../admins');

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
    const list = await clients.listClients({ limit: 200 });
    const rows = list
      .map(
        (c) => `<tr>
          <td><a href="/clients/${c.id}">#${c.id}</a></td>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.city)}</td>
          <td><span class="pill">${escapeHtml(c.status)}</span></td>
          <td>${escapeHtml(c.survey_strategy || '—')}</td>
          <td>${c.wants_plan ? 'да' : 'нет'}</td>
          <td class="muted">${fmtDate(c.created_at)}</td>
        </tr>`
      )
      .join('');

    const body = `
      <h2>Клиенты (${list.length})</h2>
      <div class="card">
        <table>
          <tr><th>ID</th><th>Имя</th><th>Город</th><th>Статус</th><th>Стратегия</th><th>Хочет план</th><th>Создан</th></tr>
          ${rows || '<tr><td colspan="7" class="muted">Клиентов пока нет</td></tr>'}
        </table>
      </div>`;
    res.send(layout({ title: 'Клиенты', active: '/clients', body }));
  })
);

app.get(
  '/clients/:id',
  wrapErrors(async (req, res) => {
    const client = await clients.getClient(req.params.id);
    if (!client) return res.status(404).send('Клиент не найден');
    const answers = await clients.getClientAnswers(client.id);

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

// ---- Админы (только просмотр — управление через команды бота) -------------

app.get(
  '/admins',
  wrapErrors(async (req, res) => {
    const list = await admins.listAdmins();
    const rows = list
      .map(
        (a) => `<tr>
          <td>${a.role === 'owner' ? '<span class="badge-owner">👑 владелец</span>' : '🛡 админ'}</td>
          <td>${a.telegram_username ? '@' + escapeHtml(a.telegram_username) : '—'}</td>
          <td class="muted">${a.telegram_id}</td>
          <td class="muted">${fmtDate(a.created_at)}</td>
        </tr>`
      )
      .join('');
    const body = `
      <h2>Админы бота</h2>
      <p class="muted">Управляются командами в самом Telegram-боте: /addadmin, /removeadmin, /admins — эта страница только для просмотра.</p>
      <div class="card">
        <table>
          <tr><th>Роль</th><th>Username</th><th>Telegram ID</th><th>Добавлен</th></tr>
          ${rows || '<tr><td colspan="4" class="muted">Пока нет ни одного админа — назначьте владельца через OWNER_TELEGRAM_ID в .env</td></tr>'}
        </table>
      </div>`;
    res.send(layout({ title: 'Админы', active: '/admins', body }));
  })
);

app.use((err, req, res, next) => {
  console.error('Ошибка веб-админки:', err);
  res.status(500).send('Внутренняя ошибка. Подробности — в логах сервера.');
});

app.listen(ADMIN_WEB.port, () => {
  console.log(`Веб-админка запущена на порту ${ADMIN_WEB.port}`);
});
