// Анкета настраивается из БД (таблицы survey_strategies / survey_questions /
// survey_strategy_questions, см. migrations/), а не жёстко в коде — состав и
// порядок вопросов можно менять прямо в базе (через веб-админку), без деплоя.
const pool = require('./db');

function normalizeQuestion(row) {
  return {
    id: row.id,
    code: row.code,
    text: row.question_text,
    type: row.question_type,
    options: Array.isArray(row.options) ? row.options : row.options ? JSON.parse(row.options) : null,
    active: !!row.active,
  };
}

async function listStrategies() {
  const [rows] = await pool.query(
    `SELECT s.id, s.code, s.name, s.description, COUNT(sq.id) AS question_count
     FROM survey_strategies s
     LEFT JOIN survey_strategy_questions sq ON sq.strategy_id = s.id
     GROUP BY s.id
     ORDER BY question_count ASC`
  );
  return rows;
}

// Вопросы конкретной стратегии для прохождения ботом — только активные, по порядку.
async function getQuestions(strategyCode) {
  const [rows] = await pool.query(
    `SELECT q.id, q.code, q.question_text, q.question_type, q.options
     FROM survey_strategy_questions sq
     JOIN survey_questions q ON q.id = sq.question_id
     JOIN survey_strategies s ON s.id = sq.strategy_id
     WHERE s.code = ? AND q.active = 1
     ORDER BY sq.position`,
    [strategyCode]
  );
  return rows.map(normalizeQuestion);
}

// Всё содержимое стратегии для админки — включая неактивные вопросы, чтобы их
// тоже можно было увидеть/убрать из стратегии.
async function getStrategyDetail(strategyCode) {
  const [strategyRows] = await pool.query('SELECT id, code, name, description FROM survey_strategies WHERE code = ?', [
    strategyCode,
  ]);
  const strategy = strategyRows[0];
  if (!strategy) return null;

  const [questionRows] = await pool.query(
    `SELECT sq.position, q.id, q.code, q.question_text, q.question_type, q.options, q.active
     FROM survey_strategy_questions sq
     JOIN survey_questions q ON q.id = sq.question_id
     WHERE sq.strategy_id = ?
     ORDER BY sq.position`,
    [strategy.id]
  );
  const questions = questionRows.map((row) => ({ position: row.position, ...normalizeQuestion(row) }));

  const includedIds = questions.map((q) => q.id);
  const [availableRows] = await pool.query(
    `SELECT id, code, question_text, question_type, options, active
     FROM survey_questions
     WHERE id NOT IN (${includedIds.length ? includedIds.map(() => '?').join(',') : 'SELECT 0'})
     ORDER BY code`,
    includedIds
  );
  const available = availableRows.map(normalizeQuestion);

  return { ...strategy, questions, available };
}

async function listAllQuestions() {
  const [rows] = await pool.query('SELECT id, code, question_text, question_type, options, active FROM survey_questions ORDER BY code');
  return rows.map(normalizeQuestion);
}

async function getQuestionById(id) {
  const [rows] = await pool.query(
    'SELECT id, code, question_text, question_type, options, active FROM survey_questions WHERE id = ?',
    [id]
  );
  return rows[0] ? normalizeQuestion(rows[0]) : null;
}

async function createQuestion({ code, text, type, options, active }) {
  await pool.query(
    `INSERT INTO survey_questions (code, question_text, question_type, options, active)
     VALUES (?, ?, ?, ?, ?)`,
    [code, text, type, options && options.length ? JSON.stringify(options) : null, active ? 1 : 0]
  );
}

async function updateQuestion(id, { text, type, options, active }) {
  await pool.query(
    `UPDATE survey_questions
     SET question_text = ?, question_type = ?, options = ?, active = ?
     WHERE id = ?`,
    [text, type, options && options.length ? JSON.stringify(options) : null, active ? 1 : 0, id]
  );
}

async function addQuestionToStrategy(strategyCode, questionId) {
  const [[strategy]] = await pool.query('SELECT id FROM survey_strategies WHERE code = ?', [strategyCode]);
  if (!strategy) throw new Error(`Неизвестная стратегия: ${strategyCode}`);
  const [[{ nextPosition }]] = await pool.query(
    'SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition FROM survey_strategy_questions WHERE strategy_id = ?',
    [strategy.id]
  );
  await pool.query(
    `INSERT INTO survey_strategy_questions (strategy_id, question_id, position)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE position = VALUES(position)`,
    [strategy.id, questionId, nextPosition]
  );
}

async function removeQuestionFromStrategy(strategyCode, questionId) {
  await pool.query(
    `DELETE sq FROM survey_strategy_questions sq
     JOIN survey_strategies s ON s.id = sq.strategy_id
     WHERE s.code = ? AND sq.question_id = ?`,
    [strategyCode, questionId]
  );
}

// orderedQuestionIds — id вопросов в желаемом порядке; позиции пересчитываются 1..N.
async function reorderStrategy(strategyCode, orderedQuestionIds) {
  const [[strategy]] = await pool.query('SELECT id FROM survey_strategies WHERE code = ?', [strategyCode]);
  if (!strategy) throw new Error(`Неизвестная стратегия: ${strategyCode}`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Сначала уводим все позиции в заведомо свободный диапазон, чтобы не
    // споткнуться об UNIQUE(strategy_id, position) при пересборке порядка.
    await connection.query('UPDATE survey_strategy_questions SET position = position + 100000 WHERE strategy_id = ?', [
      strategy.id,
    ]);
    for (let i = 0; i < orderedQuestionIds.length; i += 1) {
      await connection.query(
        'UPDATE survey_strategy_questions SET position = ? WHERE strategy_id = ? AND question_id = ?',
        [i + 1, strategy.id, orderedQuestionIds[i]]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function moveQuestionInStrategy(strategyCode, questionId, direction) {
  const detail = await getStrategyDetail(strategyCode);
  if (!detail) return;
  const ids = detail.questions.map((q) => q.id);
  const idx = ids.indexOf(Number(questionId));
  if (idx === -1) return;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= ids.length) return;
  [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
  await reorderStrategy(strategyCode, ids);
}

module.exports = {
  listStrategies,
  getQuestions,
  getStrategyDetail,
  listAllQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  addQuestionToStrategy,
  removeQuestionFromStrategy,
  reorderStrategy,
  moveQuestionInStrategy,
};
