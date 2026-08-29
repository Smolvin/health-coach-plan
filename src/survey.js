// Анкета настраивается из БД (таблицы survey_strategies / survey_questions /
// survey_strategy_questions, см. migrations/), а не жёстко в коде — состав и
// порядок вопросов можно менять прямо в базе, без деплоя.
const pool = require('./db');

async function listStrategies() {
  const [rows] = await pool.query(
    `SELECT s.code, s.name, s.description, COUNT(sq.id) AS question_count
     FROM survey_strategies s
     LEFT JOIN survey_strategy_questions sq ON sq.strategy_id = s.id
     GROUP BY s.id
     ORDER BY question_count ASC`
  );
  return rows;
}

async function getQuestions(strategyCode) {
  const [rows] = await pool.query(
    `SELECT q.code, q.question_text, q.question_type, q.options
     FROM survey_strategy_questions sq
     JOIN survey_questions q ON q.id = sq.question_id
     JOIN survey_strategies s ON s.id = sq.strategy_id
     WHERE s.code = ? AND q.active = 1
     ORDER BY sq.position`,
    [strategyCode]
  );
  return rows.map((row) => ({
    code: row.code,
    text: row.question_text,
    type: row.question_type,
    options: Array.isArray(row.options) ? row.options : row.options ? JSON.parse(row.options) : null,
  }));
}

module.exports = { listStrategies, getQuestions };
