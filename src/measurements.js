// Замеры клиента — гибкий набор параметров из справочника measurement_types
// (вес, талия, ...), клиент сам решает, что замерить в этот раз.
const pool = require('./db');

async function listTypes({ activeOnly = true } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM measurement_types ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY position, name`
  );
  return rows;
}

async function getTypeByCode(code) {
  const [rows] = await pool.query('SELECT * FROM measurement_types WHERE code = ?', [code]);
  return rows[0] || null;
}

async function addMeasurement(clientId, measurementTypeId, value, recordedAt) {
  const [result] = await pool.query(
    'INSERT INTO client_measurements (client_id, measurement_type_id, value, recorded_at) VALUES (?, ?, ?, ?)',
    [clientId, measurementTypeId, value, recordedAt || new Date()]
  );
  return result.insertId;
}

async function listForClient(clientId, { limit = 50 } = {}) {
  const [rows] = await pool.query(
    `SELECT m.*, t.name AS type_name, t.unit, t.code AS type_code
     FROM client_measurements m
     JOIN measurement_types t ON t.id = m.measurement_type_id
     WHERE m.client_id = ?
     ORDER BY m.recorded_at DESC, m.id DESC
     LIMIT ?`,
    [clientId, limit]
  );
  return rows;
}

// Клиенты, кому пора напомнить: последний замер (или создание анкеты, если
// замеров не было вовсе) — 14+ дней назад, и напоминание не отправлялось
// последние 14 дней (не спамить каждый день, пока клиент тянет с замерами).
async function listClientsDueForReminder() {
  const [rows] = await pool.query(`
    SELECT c.id, c.telegram_id, c.name
    FROM clients c
    LEFT JOIN (
      SELECT client_id, MAX(recorded_at) AS latest FROM client_measurements GROUP BY client_id
    ) m ON m.client_id = c.id
    WHERE c.deleted_at IS NULL
      AND c.status = 'questionnaire_completed'
      AND c.measurement_reminders_enabled = 1
      AND COALESCE(m.latest, DATE(c.created_at)) <= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
      AND (c.last_measurement_reminder_at IS NULL OR c.last_measurement_reminder_at <= DATE_SUB(NOW(), INTERVAL 14 DAY))
  `);
  return rows;
}

async function markReminderSent(clientId) {
  await pool.query('UPDATE clients SET last_measurement_reminder_at = NOW() WHERE id = ?', [clientId]);
}

module.exports = {
  listTypes,
  getTypeByCode,
  addMeasurement,
  listForClient,
  listClientsDueForReminder,
  markReminderSent,
};
