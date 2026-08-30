// Запросы к клиентам/анкетам — используются и ботом (сценарий анкеты), и
// админ-командами бота, и веб-админкой.
const pool = require('./db');

// deletedOnly — показать только мягко удалённых (страница "корзины"), иначе
// по умолчанию удалённые скрыты. groupId и deletedOnly можно сочетать.
async function listClients({ limit = 50, groupId, deletedOnly = false } = {}) {
  const conditions = [deletedOnly ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
  const params = [];
  if (groupId) {
    conditions.push('group_id = ?');
    params.push(groupId);
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT id, telegram_id, telegram_username, name, city, birth_date, status,
            survey_strategy, group_id, wants_plan, created_at, updated_at, deleted_at
     FROM clients
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ?`,
    params
  );
  return rows;
}

// Без фильтра по deleted_at — карточке клиента и восстановлению нужно видеть
// его и в удалённом состоянии, не только "живых".
async function getClient(id) {
  const [rows] = await pool.query('SELECT * FROM clients WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getClientByTelegramId(telegramId) {
  const [rows] = await pool.query('SELECT * FROM clients WHERE telegram_id = ?', [telegramId]);
  return rows[0] || null;
}

async function getClientAnswers(clientId) {
  const [rows] = await pool.query(
    `SELECT round, question_number, question_text, answer_text, answered_at
     FROM questionnaire_answers
     WHERE client_id = ?
     ORDER BY round, question_number`,
    [clientId]
  );
  return rows;
}

async function getAnsweredCount(clientId, round) {
  const [[{ n }]] = await pool.query(
    'SELECT COUNT(*) AS n FROM questionnaire_answers WHERE client_id = ? AND round = ?',
    [clientId, round]
  );
  return n;
}

async function findClientByUsername(username) {
  const clean = username.replace(/^@/, '');
  const [rows] = await pool.query(
    'SELECT id, telegram_id, telegram_username, name FROM clients WHERE telegram_username = ? LIMIT 1',
    [clean]
  );
  return rows[0] || null;
}

async function setClientGroup(clientId, groupId) {
  await pool.query('UPDATE clients SET group_id = ? WHERE id = ?', [groupId, clientId]);
}

// Админ может выключить замеры и/или напоминания о них отдельно для клиента —
// например, оставить возможность вносить замеры самому, но не напоминать.
async function setMeasurementSettings(clientId, { measurementsEnabled, remindersEnabled }) {
  await pool.query('UPDATE clients SET measurements_enabled = ?, measurement_reminders_enabled = ? WHERE id = ?', [
    measurementsEnabled ? 1 : 0,
    remindersEnabled ? 1 : 0,
    clientId,
  ]);
}

// Мягкое удаление — только флаг, строка и всё связанное (ответы, логи,
// снимки) остаётся в базе физически и восстановимо.
async function deleteClient(clientId) {
  await pool.query('UPDATE clients SET deleted_at = NOW() WHERE id = ?', [clientId]);
}

async function restoreClient(clientId) {
  await pool.query('UPDATE clients SET deleted_at = NULL WHERE id = ?', [clientId]);
}

// telegram_id уникален, поэтому если этот клиент был мягко удалён и снова
// написал боту — ON DUPLICATE KEY UPDATE найдёт его строку по ключу в любом
// случае; deleted_at = NULL здесь специально снимает удаление, иначе он бы
// продолжил анкету, но остался бы невидим в /clients.
async function upsertClient(state, telegramId, telegramUsername) {
  await pool.query(
    `INSERT INTO clients (telegram_id, telegram_username, name, city, birth_date, wants_plan, survey_strategy, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'card_created')
     ON DUPLICATE KEY UPDATE
       telegram_username = VALUES(telegram_username),
       name = VALUES(name),
       city = VALUES(city),
       birth_date = VALUES(birth_date),
       wants_plan = VALUES(wants_plan),
       survey_strategy = VALUES(survey_strategy),
       status = IF(status = 'questionnaire_completed', status, 'card_created'),
       deleted_at = NULL`,
    [
      telegramId,
      telegramUsername || null,
      state.name,
      state.city,
      state.birthDate,
      state.wantsPlan ? 1 : 0,
      state.strategyCode || null,
    ]
  );
  const [rows] = await pool.query('SELECT id FROM clients WHERE telegram_id = ?', [telegramId]);
  return rows[0].id;
}

async function saveAnswer(clientId, round, questionNumber, questionText, answerText) {
  await pool.query(
    `INSERT INTO questionnaire_answers (client_id, round, question_number, question_text, answer_text, answered_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text), answered_at = NOW()`,
    [clientId, round, questionNumber, questionText, answerText]
  );
}

async function markCompleted(clientId) {
  await pool.query(`UPDATE clients SET status = 'questionnaire_completed' WHERE id = ?`, [clientId]);
}

async function upgradeStrategy(clientId, strategyCode) {
  await pool.query('UPDATE clients SET survey_strategy = ? WHERE id = ?', [strategyCode, clientId]);
}

// Мягко удалённые клиенты не учитываются — статистика про "живых".
async function getStats() {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM clients WHERE deleted_at IS NULL');
  const [byStatus] = await pool.query(
    'SELECT status, COUNT(*) AS n FROM clients WHERE deleted_at IS NULL GROUP BY status ORDER BY n DESC'
  );
  const [byStrategy] = await pool.query(
    `SELECT COALESCE(survey_strategy, 'не выбрана') AS survey_strategy, COUNT(*) AS n
     FROM clients WHERE deleted_at IS NULL GROUP BY survey_strategy ORDER BY n DESC`
  );
  const [[{ totalAnswers }]] = await pool.query(
    `SELECT COUNT(*) AS totalAnswers FROM questionnaire_answers qa
     JOIN clients c ON c.id = qa.client_id WHERE c.deleted_at IS NULL`
  );
  return { total, byStatus, byStrategy, totalAnswers };
}

module.exports = {
  listClients,
  getClient,
  getClientByTelegramId,
  getClientAnswers,
  getAnsweredCount,
  findClientByUsername,
  setClientGroup,
  setMeasurementSettings,
  deleteClient,
  restoreClient,
  upsertClient,
  saveAnswer,
  markCompleted,
  upgradeStrategy,
  getStats,
};
