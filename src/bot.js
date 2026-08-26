const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    'Привет! Я бот персонального тренера и диетолога.\n\n' +
      'Пока я умею только здороваться — сценарий анкеты из 15 вопросов и выдача программы тренировок/питания в разработке.'
  );
});

bot.help((ctx) => {
  ctx.reply('Команды:\n/start — начать\n/help — эта справка');
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
