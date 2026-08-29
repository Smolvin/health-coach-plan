// Запросы к клиентам/анкетам — используются и админ-командами бота, и веб-админкой.
const pool = require('./db');

async function listClients({ limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT id, telegram_id, telegram_username, name, city, birth_date, status,
            survey_strategy, wants_plan, created_at, updated_at
     FROM clients
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

async function getClient(id) {
  const [rows] = await pool.query('SELECT * FROM clients WHERE id = ?', [id]);
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

async function findClientByUsername(username) {
  const clean = username.replace(/^@/, '');
  const [rows] = await pool.query(
    'SELECT id, telegram_id, telegram_username, name FROM clients WHERE telegram_username = ? LIMIT 1',
    [clean]
  );
  return rows[0] || null;
}

async function getStats() {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM clients');
  const [byStatus] = await pool.query('SELECT status, COUNT(*) AS n FROM clients GROUP BY status ORDER BY n DESC');
  const [byStrategy] = await pool.query(
    `SELECT COALESCE(survey_strategy, 'не выбрана') AS survey_strategy, COUNT(*) AS n
     FROM clients GROUP BY survey_strategy ORDER BY n DESC`
  );
  const [[{ totalAnswers }]] = await pool.query('SELECT COUNT(*) AS totalAnswers FROM questionnaire_answers');
  return { total, byStatus, byStrategy, totalAnswers };
}

module.exports = { listClients, getClient, getClientAnswers, findClientByUsername, getStats };
