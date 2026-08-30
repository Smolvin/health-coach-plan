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

// deletedOnly — только мягко удалённые (страница "корзины"), иначе по
// умолчанию скрыты.
async function listGyms({ deletedOnly = false } = {}) {
  const [rows] = await pool.query(
    `SELECT g.*, COUNT(e.id) AS equipment_count
     FROM gyms g
     LEFT JOIN gym_equipment e ON e.gym_id = g.id
     WHERE g.deleted_at IS ${deletedOnly ? 'NOT NULL' : 'NULL'}
     GROUP BY g.id
     ORDER BY g.created_at DESC`
  );
  return rows;
}

// Без фильтра по deleted_at — карточке зала и восстановлению нужно видеть
// его и в удалённом состоянии.
async function getGym(id) {
  const [rows] = await pool.query('SELECT * FROM gyms WHERE id = ?', [id]);
  return rows[0] || null;
}

// Общая для CLI-импортов (scripts/import_media.js, scripts/import_catalog.js):
// найти зал по названию (без учёта регистра) или завести новый, если нет.
async function findOrCreateGym({ name, type = 'location', location = null, createdBy }) {
  const all = await listGyms();
  const existing = all.find((g) => g.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const id = await createGym({ name, type, location, createdBy });
  return getGym(id);
}

// Мягкое удаление — только флаг. Оборудование и фото в MinIO не трогаются,
// чтобы восстановление возвращало зал в точности как было.
async function deleteGym(gymId) {
  await pool.query('UPDATE gyms SET deleted_at = NOW() WHERE id = ?', [gymId]);
}

async function restoreGym(gymId) {
  await pool.query('UPDATE gyms SET deleted_at = NULL WHERE id = ?', [gymId]);
}

module.exports = { createGym, listGyms, getGym, findOrCreateGym, deleteGym, restoreGym };
