require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не задан. Скопируй .env.example в .env и укажи токен бота от @BotFather.');
}

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

module.exports = { BOT_TOKEN, DB };
