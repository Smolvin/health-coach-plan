require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не задан. Скопируй .env.example в .env и укажи токен бота от @BotFather.');
}

module.exports = { BOT_TOKEN };
