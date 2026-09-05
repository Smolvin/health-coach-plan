// Рекомендация (программа тренировок + план питания) по одному раунду анкеты
// клиента. Тренер готовит текст вручную на основе ответов раунда и правит
// прямо в веб-админке — здесь только хранение, без генерации.
const pool = require('./db');

async function getRecommendation(clientId, round) {
  const [rows] = await pool.query(
    'SELECT * FROM client_recommendations WHERE client_id = ? AND round = ?',
    [clientId, round]
  );
  return rows[0] || null;
}

async function upsertRecommendation(clientId, round, { trainingPlan, nutritionPlan, notes }) {
  await pool.query(
    `INSERT INTO client_recommendations (client_id, round, training_plan, nutrition_plan, notes)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       training_plan = VALUES(training_plan),
       nutrition_plan = VALUES(nutrition_plan),
       notes = VALUES(notes)`,
    [clientId, round, trainingPlan || null, nutritionPlan || null, notes || null]
  );
}

module.exports = { getRecommendation, upsertRecommendation };
