// История раундов анкеты клиента. Сами ответы по-прежнему в
// questionnaire_answers, связь — через (client_id, round). round 2
// зарезервирован под "расширение" (/extend); повторные полные анкеты
// (/newsurvey) начинаются с round 3 и дальше — так они никогда не
// пересекутся с зарезервированным под extend номером, даже если клиент ни
// разу не расширял анкету.
const pool = require('./db');

async function getNextRound(clientId) {
  const [[{ maxRound }]] = await pool.query(
    'SELECT MAX(round) AS maxRound FROM client_surveys WHERE client_id = ?',
    [clientId]
  );
  return Math.max(maxRound || 1, 2) + 1;
}

async function createSurveyRound(clientId, round, kind, strategyCode) {
  await pool.query(
    `INSERT INTO client_surveys (client_id, round, kind, strategy_code, status)
     VALUES (?, ?, ?, ?, 'in_progress')
     ON DUPLICATE KEY UPDATE kind = VALUES(kind), strategy_code = VALUES(strategy_code), status = 'in_progress', completed_at = NULL`,
    [clientId, round, kind, strategyCode]
  );
}

async function completeSurveyRound(clientId, round) {
  await pool.query(
    `UPDATE client_surveys SET status = 'completed', completed_at = NOW() WHERE client_id = ? AND round = ?`,
    [clientId, round]
  );
}

async function listClientSurveys(clientId) {
  const [rows] = await pool.query('SELECT * FROM client_surveys WHERE client_id = ? ORDER BY round DESC', [
    clientId,
  ]);
  return rows;
}

async function getSurveyRound(clientId, round) {
  const [rows] = await pool.query('SELECT * FROM client_surveys WHERE client_id = ? AND round = ?', [
    clientId,
    round,
  ]);
  return rows[0] || null;
}

// Для выпадающего списка в веб-админке — все завершённые раунды всех клиентов,
// чтобы выбрать "чью анкету и какого раунда скопировать".
async function listAllCompletedRounds() {
  const [rows] = await pool.query(
    `SELECT cs.client_id, cs.round, cs.kind, cs.strategy_code, cs.completed_at, c.name AS client_name
     FROM client_surveys cs
     JOIN clients c ON c.id = cs.client_id
     WHERE cs.status = 'completed' AND c.deleted_at IS NULL
     ORDER BY c.name, cs.round`
  );
  return rows;
}

// Копирует ответы конкретного раунда source-клиента как НОВЫЙ раунд
// target-клиента — не перезаписывает существующие раунды получателя.
async function copySurveyRoundToClient(sourceClientId, sourceRound, targetClientId) {
  const sourceSurvey = await getSurveyRound(sourceClientId, sourceRound);
  if (!sourceSurvey) throw new Error(`У клиента #${sourceClientId} нет раунда анкеты #${sourceRound}`);

  const [answers] = await pool.query(
    `SELECT question_number, question_text, answer_text, answered_at
     FROM questionnaire_answers WHERE client_id = ? AND round = ? ORDER BY question_number`,
    [sourceClientId, sourceRound]
  );

  const newRound = await getNextRound(targetClientId);
  await createSurveyRound(targetClientId, newRound, sourceSurvey.kind, sourceSurvey.strategy_code);
  for (const a of answers) {
    await pool.query(
      `INSERT INTO questionnaire_answers (client_id, round, question_number, question_text, answer_text, answered_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [targetClientId, newRound, a.question_number, a.question_text, a.answer_text, a.answered_at]
    );
  }
  await completeSurveyRound(targetClientId, newRound);
  return newRound;
}

module.exports = {
  getNextRound,
  createSurveyRound,
  completeSurveyRound,
  listClientSurveys,
  getSurveyRound,
  listAllCompletedRounds,
  copySurveyRoundToClient,
};
