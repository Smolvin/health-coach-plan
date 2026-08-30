// Клиентские команды поверх основного сценария анкеты (src/bot.js):
// /newsurvey — пройти анкету заново новым раундом, /addmeasurement и
// /measurements — замеры. Вынесено сюда, чтобы не раздувать bot.js дальше.
const { Markup } = require('telegraf');
const { getClientByTelegramId } = require('./clients');
const { listStrategies } = require('./survey');
const { getNextRound } = require('./client-surveys');
const measurements = require('./measurements');
const { ADD_MEASUREMENT_SCENE_ID } = require('./measurement-scene');

function strategyLabel(strategy) {
  return `${strategy.name} — ${strategy.question_count} вопросов`;
}

function registerSurveyCommands(bot, onboardingSceneId) {
  bot.command('newsurvey', async (ctx) => {
    const client = await getClientByTelegramId(ctx.from.id);
    if (!client) return ctx.reply('Сначала пройди анкету: /start');
    if (client.status !== 'questionnaire_completed') {
      return ctx.reply('Сначала заверши текущую анкету: /continue');
    }

    const nextRound = await getNextRound(client.id);
    const strategies = await listStrategies();
    const strategyOptions = {};
    strategies.forEach((s) => {
      strategyOptions[strategyLabel(s)] = s.code;
    });

    await ctx.reply(
      'Начнём анкету заново — посмотрим, что изменилось за это время. Какую анкету пройдём?',
      Markup.keyboard(Object.keys(strategyOptions), { columns: 1 }).oneTime().resize()
    );
    return ctx.scene.enter(onboardingSceneId, {
      newSurveyRound: nextRound,
      clientId: client.id,
      strategyOptions,
    });
  });

  bot.command('addmeasurement', async (ctx) => {
    const client = await getClientByTelegramId(ctx.from.id);
    if (!client) return ctx.reply('Сначала пройди анкету: /start');
    if (!client.measurements_enabled) {
      return ctx.reply('Замеры для тебя сейчас отключены — обратись к своему тренеру.');
    }
    return ctx.scene.enter(ADD_MEASUREMENT_SCENE_ID, { clientId: client.id });
  });

  bot.command('measurements', async (ctx) => {
    const client = await getClientByTelegramId(ctx.from.id);
    if (!client) return ctx.reply('Сначала пройди анкету: /start');
    if (!client.measurements_enabled) {
      return ctx.reply('Замеры для тебя сейчас отключены — обратись к своему тренеру.');
    }

    const list = await measurements.listForClient(client.id, { limit: 20 });
    if (!list.length) return ctx.reply('Замеров пока нет. Записать: /addmeasurement');

    const lines = list.map((m) => {
      const date = m.recorded_at instanceof Date ? m.recorded_at.toISOString().slice(0, 10) : String(m.recorded_at);
      return `${date} — ${m.type_name}: ${m.value}${m.unit || ''}`;
    });
    ctx.reply(`Твои последние замеры:\n\n${lines.join('\n')}`);
  });
}

module.exports = { registerSurveyCommands };
