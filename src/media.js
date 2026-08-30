// Маппинг фото зала/оборудования на объекты в MinIO (таблица gym_media).
// Ключи вида gym/<gym_id>/equipment/<equipment_id>.jpg — своя "папка" на зал
// (в S3/MinIO это не настоящая директория, а просто общий префикс ключа;
// .keep-объект кладём, чтобы префикс был виден в консоли MinIO как папка).
const pool = require('./db');
const { client, bucket } = require('./minio-client');

function gymFolderPrefix(gymId) {
  return `gym/${gymId}/`;
}

function equipmentObjectKey(gymId, equipmentId, extension) {
  return `${gymFolderPrefix(gymId)}equipment/${equipmentId}${extension}`;
}

async function ensureBucket() {
  const exists = await client.bucketExists(bucket).catch(() => false);
  if (!exists) await client.makeBucket(bucket);
}

async function ensureGymFolder(gymId) {
  await ensureBucket();
  await client.putObject(bucket, `${gymFolderPrefix(gymId)}.keep`, Buffer.from(''));
}

async function uploadEquipmentPhoto({ gymId, equipmentId, buffer, contentType, telegramFileId, uploadedBy }) {
  await ensureBucket();
  const extension = contentType === 'image/png' ? '.png' : '.jpg';
  const key = equipmentObjectKey(gymId, equipmentId, extension);

  await client.putObject(bucket, key, buffer, buffer.length, { 'Content-Type': contentType || 'image/jpeg' });

  const [result] = await pool.query(
    `INSERT INTO gym_media (gym_id, gym_equipment_id, minio_bucket, minio_key, content_type, size_bytes, source_telegram_file_id, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content_type = VALUES(content_type), size_bytes = VALUES(size_bytes)`,
    [gymId, equipmentId, bucket, key, contentType || null, buffer.length, telegramFileId || null, uploadedBy]
  );
  return { id: result.insertId, key };
}

async function getMediaForEquipment(equipmentId) {
  const [rows] = await pool.query(
    'SELECT * FROM gym_media WHERE gym_equipment_id = ? ORDER BY created_at DESC LIMIT 1',
    [equipmentId]
  );
  return rows[0] || null;
}

// Возвращает Node Readable stream с байтами объекта.
async function streamObject(key) {
  return client.getObject(bucket, key);
}

function listGymObjectKeys(gymId) {
  return new Promise((resolve, reject) => {
    const keys = [];
    const stream = client.listObjectsV2(bucket, gymFolderPrefix(gymId), true);
    stream.on('data', (obj) => keys.push(obj.name));
    stream.on('error', reject);
    stream.on('end', () => resolve(keys));
  });
}

// Удаляет из MinIO всё под gym/<gymId>/ — вызывать до gyms.deleteGym (FK
// каскад чистит только строки в БД, не объекты в object storage).
async function deleteGymFolder(gymId) {
  const keys = await listGymObjectKeys(gymId);
  if (keys.length) await client.removeObjects(bucket, keys);
  return keys.length;
}

module.exports = {
  ensureBucket,
  ensureGymFolder,
  uploadEquipmentPhoto,
  getMediaForEquipment,
  streamObject,
  deleteGymFolder,
  equipmentObjectKey,
  gymFolderPrefix,
};
