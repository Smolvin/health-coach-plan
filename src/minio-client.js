// Единственная точка создания MinIO-клиента — переиспользуется скриптом
// настройки (scripts/setup_minio.js), сценой загрузки фото (src/gym-scenes.js)
// и веб-админкой (src/admin/server.js), чтобы конфиг подключения не дублировался.
const { Client } = require('minio');
const { MINIO } = require('./config');

const client = new Client({
  endPoint: MINIO.endPoint,
  port: MINIO.port,
  useSSL: MINIO.useSSL,
  accessKey: MINIO.accessKey,
  secretKey: MINIO.secretKey,
});

module.exports = { client, bucket: MINIO.bucket };
