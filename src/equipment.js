// Классы оборудования — переиспользуемый справочник (одна и та же "скамья для
// жима" бывает в разных залах), и сами единицы оборудования с фото в конкретном
// зале. Фото не в нашем хранилище — только photo_file_id из Telegram, файл
// перезапрашивается у Telegram API по требованию (бот/веб-админка).
const pool = require('./db');

async function createClass(code, name, description) {
  await pool.query('INSERT INTO equipment_classes (code, name, description) VALUES (?, ?, ?)', [
    code,
    name,
    description || null,
  ]);
}

async function listClasses() {
  const [rows] = await pool.query('SELECT * FROM equipment_classes ORDER BY name');
  return rows;
}

async function getClassByCode(code) {
  const [rows] = await pool.query('SELECT * FROM equipment_classes WHERE code = ?', [code]);
  return rows[0] || null;
}

// added_by нужен, чтобы позже можно было проверить "своё фото" при классификации.
async function addPhoto({ gymId, photoFileId, name, addedBy }) {
  const [result] = await pool.query(
    'INSERT INTO gym_equipment (gym_id, photo_file_id, name, added_by) VALUES (?, ?, ?, ?)',
    [gymId, photoFileId, name || null, addedBy]
  );
  return result.insertId;
}

async function listGymEquipment(gymId) {
  const [rows] = await pool.query(
    `SELECT e.*, c.name AS class_name, c.code AS class_code
     FROM gym_equipment e
     LEFT JOIN equipment_classes c ON c.id = e.equipment_class_id
     WHERE e.gym_id = ?
     ORDER BY e.created_at DESC`,
    [gymId]
  );
  return rows;
}

async function getEquipment(id) {
  const [rows] = await pool.query(
    `SELECT e.*, c.name AS class_name, c.code AS class_code, g.name AS gym_name
     FROM gym_equipment e
     LEFT JOIN equipment_classes c ON c.id = e.equipment_class_id
     JOIN gyms g ON g.id = e.gym_id
     WHERE e.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// classId = null допустимо (снять классификацию); name — если не передали, старое не трогаем.
async function classify(id, classId, name) {
  await pool.query('UPDATE gym_equipment SET equipment_class_id = ?, name = COALESCE(?, name) WHERE id = ?', [
    classId,
    name || null,
    id,
  ]);
}

module.exports = { createClass, listClasses, getClassByCode, addPhoto, listGymEquipment, getEquipment, classify };
