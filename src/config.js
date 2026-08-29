require('dotenv').config();

// BOT_TOKEN не проверяется здесь: config.js используется и скриптами, которым
// он не нужен (например, scripts/check-db.js) — проверка в src/bot.js, перед
// запуском самого бота.
const BOT_TOKEN = process.env.BOT_TOKEN;

// Один конфиг для любого MySQL: локальный контейнер этого проекта, MySQL на машине
// или удалённый сервер на VPS — просто разные значения DB_HOST/DB_PORT в .env.
// См. комментарии в .env.example.
const DB = {
  host: process.env.DB_HOST || 'mysql',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'health',
  user: process.env.DB_USER || 'health',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true',
};

// Telegram ID владельца проекта — при старте бота закрепляется как единственный
// 'owner' в таблице admins (см. src/admins.js), если владелец ещё не назначен.
// Узнать свой ID можно командой /whoami в самом боте.
const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID ? Number(process.env.OWNER_TELEGRAM_ID) : null;

// Веб-админка (src/admin/server.js): список клиентов, редактирование анкеты.
// Закрыта общим логином/паролем (HTTP Basic Auth) — это не то же самое, что
// роли owner/admin в боте, отдельный вход для тех, у кого есть доступ к .env.
const ADMIN_WEB = {
  port: Number(process.env.ADMIN_PORT) || 4000,
  user: process.env.ADMIN_WEB_USER || 'admin',
  password: process.env.ADMIN_WEB_PASSWORD || '',
};

// Хранилище фото залов/оборудования (S3-совместимое, MinIO). Своего файлового
// стораджа у проекта нет — используется общий MinIO инстанс, см. .env.example.
const MINIO = {
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
  bucket: process.env.MINIO_BUCKET || 'health-coach-plan',
};

module.exports = { BOT_TOKEN, DB, OWNER_TELEGRAM_ID, ADMIN_WEB, MINIO };
