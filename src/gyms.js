// Залы — привязаны к локации (адрес/город) или "типовые" (шаблонный набор
// оборудования без конкретного адреса). Заводит клиент или админ.
const pool = require('./db');

async function createGym({ name, type, location, createdBy }) {
  const [result] = await pool.query('INSERT INTO gyms (name, type, location, created_by) VALUES (?, ?, ?, ?)', [
    name,
    type,
    type === 'template' ? null : location || null,
    createdBy,
  ]);
  return result.insertId;
}

async function listGyms() {
  const [rows] = await pool.query(
    `SELECT g.*, COUNT(e.id) AS equipment_count
     FROM gyms g
     LEFT JOIN gym_equipment e ON e.gym_id = g.id
     GROUP BY g.id
     ORDER BY g.created_at DESC`
  );
  return rows;
}

async function getGym(id) {
  const [rows] = await pool.query('SELECT * FROM gyms WHERE id = ?', [id]);
  return rows[0] || null;
}

module.exports = { createGym, listGyms, getGym };
