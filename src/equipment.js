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

async function listClasses({ limit, offset = 0 } = {}) {
  const params = [];
  let sql = 'SELECT * FROM equipment_classes ORDER BY name';
  if (limit) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function countClasses() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM equipment_classes');
  return n;
}

async function getClassByCode(code) {
  const [rows] = await pool.query('SELECT * FROM equipment_classes WHERE code = ?', [code]);
  return rows[0] || null;
}

// Для каталожного импорта (scripts/import_catalog.js) — категории каталога
// становятся классами один в один, без риска задвоить при повторном запуске.
async function getOrCreateClass(code, name, description) {
  const existing = await getClassByCode(code);
  if (existing) return existing;
  await createClass(code, name, description);
  return getClassByCode(code);
}

// added_by нужен, чтобы позже можно было проверить "своё фото" при классификации.
// photoFileId — из Telegram (поштучная загрузка через бота); sourceFile — имя
// исходного файла при массовом импорте (scripts/import_media.js,
// scripts/import_catalog.js). classId/description/quantitySeen заполняются
// сразу при каталожном импорте — там оборудование приходит уже классифицированным.
async function addPhoto({
  gymId,
  photoFileId = null,
  sourceFile = null,
  name,
  description = null,
  quantitySeen = null,
  classId = null,
  addedBy,
}) {
  const [result] = await pool.query(
    `INSERT INTO gym_equipment
       (gym_id, photo_file_id, source_file, name, description, quantity_seen, equipment_class_id, added_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [gymId, photoFileId, sourceFile, name || null, description, quantitySeen, classId, addedBy]
  );
  return result.insertId;
}

// Для идемпотентности импорта из папки — не тащить один и тот же файл дважды.
async function findBySourceFile(gymId, sourceFile) {
  const [rows] = await pool.query('SELECT id FROM gym_equipment WHERE gym_id = ? AND source_file = ?', [
    gymId,
    sourceFile,
  ]);
  return rows[0] || null;
}

async function listGymEquipment(gymId, { limit, offset = 0 } = {}) {
  const params = [gymId];
  let sql = `SELECT e.*, c.name AS class_name, c.code AS class_code
     FROM gym_equipment e
     LEFT JOIN equipment_classes c ON c.id = e.equipment_class_id
     WHERE e.gym_id = ?
     ORDER BY e.created_at DESC`;
  if (limit) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function countGymEquipment(gymId) {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM gym_equipment WHERE gym_id = ?', [gymId]);
  return n;
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

module.exports = {
  createClass,
  listClasses,
  countClasses,
  getClassByCode,
  getOrCreateClass,
  addPhoto,
  findBySourceFile,
  listGymEquipment,
  countGymEquipment,
  getEquipment,
  classify,
};
