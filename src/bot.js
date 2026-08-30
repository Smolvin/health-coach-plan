const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { BOT_TOKEN, OWNER_TELEGRAM_ID } = require('./config');
const { listStrategies, getQuestions, getStrategyDelta } = require('./survey');
const {
  getClientByTelegramId,
  getAnsweredCount,
  upsertClient,
  saveAnswer,
  markCompleted,
  upgradeStrategy,
} = require('./clients');
const { ensureOwner } = require('./admins');
const { registerAdminCommands } = require('./admin-commands');
const { registerGroupCommands } = require('./group-commands');
const { editAnswerScene } = require('./edit-answer-scene');
const { registerGymCommands } = require('./gym-commands');
const { createGymScene, addEquipmentScene } = require('./gym-scenes');
const { createSurveyRound, completeSurveyRound, listClientSurveys } = require('./client-surveys');
const { registerSurveyCommands } = require('./survey-commands');
const { addMeasurementScene } = require('./measurement-scene');
const { listClientsDueForReminder, markReminderSent } = require('./measurements');
const { setDefaultMenu, syncAllAdminMenus } = require('./menu');

const ONBOARDING_SCENE_ID = 'onboarding';

const YES_NO_KEYBOARD = Markup.keyboard(['Да', 'Нет'], { columns: 2 }).oneTime().resize();

function parseBirthDate(text) {
  const dmy = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const ymd = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return text.trim();
  return null;
}

// mysql2 отдаёт DATE-колонку как JS Date — приводим обратно к YYYY-MM-DD,
// чтобы можно было переиспользовать в upsertClient при резюме анкеты.
function toDateString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function parseYesNo(text) {
  const t = text.trim().toLowerCase();
  if (['да', 'yes', 'y', 'ага', 'конечно'].includes(t)) return true;
  if (['нет', 'no', 'n'].includes(t)) return false;
  return null;
}

function strategyLabel(strategy) {
  return `${strategy.name} — ${strategy.question_count} вопросов`;
}

function askQuestion(ctx, question, index, total) {
  const label = `Вопрос ${index + 1}/${total}: ${question.text}`;
  if (question.type === 'yesno') {
    return ctx.reply(label, YES_NO_KEYBOARD);
  }
  if (question.type === 'choice' && question.options && question.options.length) {
    return ctx.reply(label, Markup.keyboard(question.options, { columns: 1 }).oneTime().resize());
  }
  return ctx.reply(label, Markup.removeKeyboard());
}

// Заводит ctx.scene.state так, чтобы продолжить анкету клиента с того места,
// где остановились — вызывается и на /start от уже существующего клиента, и на
// /continue, и когда клиент просто написал что-то вне сцены (сессия истекла,
// например, бот перезапускался, а анкета не была дозаполнена).
async function resumeIntoState(ctx, client) {
  const state = ctx.scene.state;
  state.name = client.name;
  state.city = client.city;
  state.birthDate = toDateString(client.birth_date);
  state.wantsPlan = !!client.wants_plan;
  state.strategyCode = client.survey_strategy;

  if (!client.wants_plan || !client.survey_strategy) {
    state.step = 'wants_plan';
    return ctx.reply(
      `С возвращением, ${client.name}! Хочешь получить готовую программу тренировок и план питания?`,
      YES_NO_KEYBOARD
    );
  }

  // Незаконченным может быть не только самый первый раунд — /extend и
  // /newsurvey тоже заводят свои раунды в client_surveys, ищем любой
  // "in_progress", не только round 1.
  const surveys = await listClientSurveys(client.id);
  const inProgress = surveys.find((s) => s.status === 'in_progress');

  if (inProgress) {
    const questions =
      inProgress.kind === 'extend'
        ? await getStrategyDelta('short', 'long')
        : await getQuestions(inProgress.strategy_code || client.survey_strategy);
    const answeredCount = await getAnsweredCount(client.id, inProgress.round);

    if (answeredCount < questions.length) {
      state.questions = questions;
      state.qi = answeredCount;
      state.round = inProgress.round;
      state.kind = inProgress.kind;
      state.strategyCode = inProgress.strategy_code || client.survey_strategy;
      state.clientId = client.id;
      state.step = 'questions';
      await ctx.reply(
        `С возвращением! Продолжим анкету (раунд ${inProgress.round}) с того же места (отвечено ${answeredCount} из ${questions.length}).`,
        Markup.removeKeyboard()
      );
      return askQuestion(ctx, questions[answeredCount], answeredCount, questions.length);
    }
  }

  if (client.survey_strategy === 'short') {
    return ctx.reply(
      'Короткая анкета уже пройдена. Если хочешь ответить ещё на несколько вопросов для более точной программы — команда /extend, или пройти всё заново — /newsurvey.',
      Markup.removeKeyboard()
    );
  }
  return ctx.reply(
    'Анкета уже полностью пройдена. Хочешь пройти заново (например, изменились параметры) — команда /newsurvey.',
    Markup.removeKeyboard()
  );
}

const onboardingScene = new Scenes.BaseScene(ONBOARDING_SCENE_ID);

onboardingScene.enter(async (ctx) => {
  const state = ctx.scene.state;

  if (state.resumeExtend) {
    state.round = 2;
    state.kind = 'extend';
    state.step = 'questions';
    await createSurveyRound(state.clientId, 2, 'extend', 'long');
    await ctx.reply(
      `Расширенная анкета — ${state.questions.length} дополнительных вопрос(ов). Погнали!`,
      Markup.removeKeyboard()
    );
    return askQuestion(ctx, state.questions[state.qi], state.qi, state.questions.length);
  }

  if (state.newSurveyRound) {
    // Приглашение выбрать стратегию уже отправлено командой /newsurvey —
    // тут просто переходим в ту же ветку 'strategy', что и у первичной анкеты.
    state.step = 'strategy';
    return;
  }

  if (state.resume) {
    return resumeIntoState(ctx, state.client);
  }

  state.step = 'name';
  ctx.reply('Начинаем анкету. Как тебя зовут?', Markup.removeKeyboard());
});

onboardingScene.on('text', async (ctx) => {
  const state = ctx.scene.state;
  const text = ctx.message.text;

  switch (state.step) {
    case 'name':
      state.name = text.trim();
      state.step = 'city';
      return ctx.reply('В каком городе живёшь?');

    case 'city':
      state.city = text.trim();
      state.step = 'birth_date';
      return ctx.reply('Дата рождения? (в формате ДД.ММ.ГГГГ)');

    case 'birth_date': {
      const parsed = parseBirthDate(text);
      if (!parsed) return ctx.reply('Не понял дату. Пришли в формате ДД.ММ.ГГГГ, например 15.03.1990.');
      state.birthDate = parsed;
      state.step = 'wants_plan';
      return ctx.reply('Хочешь получить готовую программу тренировок и план питания?', YES_NO_KEYBOARD);
    }

    case 'wants_plan': {
      const yn = parseYesNo(text);
      if (yn === null) return ctx.reply('Выбери "Да" или "Нет".', YES_NO_KEYBOARD);
      state.wantsPlan = yn;

      if (!yn) {
        try {
          await upsertClient(state, ctx.from.id, ctx.from.username);
        } catch (err) {
          console.error('Ошибка сохранения карточки клиента:', err);
          return ctx.reply('Не удалось сохранить данные, попробуй ещё раз чуть позже.');
        }
        await ctx.reply('Хорошо, карточку сохранил. Напиши /start, если передумаешь.', Markup.removeKeyboard());
        return ctx.scene.leave();
      }

      const strategies = await listStrategies();
      state.strategyOptions = {};
      strategies.forEach((s) => {
        state.strategyOptions[strategyLabel(s)] = s.code;
      });
      state.step = 'strategy';
      return ctx.reply(
        'Какую анкету пройдём?',
        Markup.keyboard(Object.keys(state.strategyOptions), { columns: 1 }).oneTime().resize()
      );
    }

    case 'strategy': {
      const code = state.strategyOptions && state.strategyOptions[text.trim()];
      if (!code) {
        return ctx.reply(
          'Выбери один из вариантов кнопкой ниже.',
          Markup.keyboard(Object.keys(state.strategyOptions), { columns: 1 }).oneTime().resize()
        );
      }
      state.strategyCode = code;
      state.questions = await getQuestions(code);
      state.kind = 'full';
      state.qi = 0;

      if (state.newSurveyRound) {
        // clientId уже известен (клиент существующий) — профиль не трогаем.
        state.round = state.newSurveyRound;
      } else {
        state.round = 1;
        try {
          state.clientId = await upsertClient(state, ctx.from.id, ctx.from.username);
        } catch (err) {
          console.error('Ошибка сохранения карточки клиента:', err);
          return ctx.reply('Не удалось сохранить данные, попробуй ещё раз чуть позже.');
        }
      }
      await createSurveyRound(state.clientId, state.round, 'full', code);

      state.step = 'questions';
      await ctx.reply(
        'Отлично! Там, где есть частые варианты — они появятся кнопками, но можно всегда написать свой ответ текстом.',
        Markup.removeKeyboard()
      );
      return askQuestion(ctx, state.questions[0], 0, state.questions.length);
    }

    case 'questions': {
      const question = state.questions[state.qi];
      let answer = text.trim();

      if (question.type === 'yesno') {
        const yn = parseYesNo(answer);
        if (yn === null) return ctx.reply('Выбери "Да" или "Нет".', YES_NO_KEYBOARD);
        answer = yn ? 'Да' : 'Нет';
      }

      try {
        await saveAnswer(state.clientId, state.round || 1, state.qi + 1, question.text, answer);
      } catch (err) {
        console.error('Ошибка сохранения ответа:', err);
        return ctx.reply('Не удалось сохранить ответ, попробуй прислать его ещё раз.');
      }

      state.qi += 1;
      if (state.qi < state.questions.length) {
        return askQuestion(ctx, state.questions[state.qi], state.qi, state.questions.length);
      }

      await completeSurveyRound(state.clientId, state.round);

      if (state.kind === 'extend') {
        await upgradeStrategy(state.clientId, 'long');
        await ctx.reply(
          'Отлично! Расширенная анкета тоже сохранена — теперь у меня полная картина.',
          Markup.removeKeyboard()
        );
      } else if (state.round > 1) {
        // /newsurvey — очередной полный раунд поверх уже пройденной анкеты.
        await upgradeStrategy(state.clientId, state.strategyCode);
        await ctx.reply(
          `Новая анкета (раунд ${state.round}) сохранена — учту изменения параметров при следующей программе.`,
          Markup.removeKeyboard()
        );
      } else {
        await markCompleted(state.clientId);
        await ctx.reply(
          'Спасибо! Анкета заполнена — все ответы сохранены. Скоро вернусь с программой тренировок и планом питания.',
          Markup.removeKeyboard()
        );
      }
      return ctx.scene.leave();
    }

    default:
      return ctx.scene.leave();
  }
});

const stage = new Scenes.Stage([onboardingScene, editAnswerScene, createGymScene, addEquipmentScene, addMeasurementScene]);

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());
bot.use(stage.middleware());

bot.start(async (ctx) => {
  const client = await getClientByTelegramId(ctx.from.id);
  if (!client) return ctx.scene.enter(ONBOARDING_SCENE_ID);
  return ctx.scene.enter(ONBOARDING_SCENE_ID, { resume: true, client });
});

bot.command('continue', async (ctx) => {
  const client = await getClientByTelegramId(ctx.from.id);
  if (!client) return ctx.reply('Ты ещё не начинал(а) анкету — напиши /start.');
  return ctx.scene.enter(ONBOARDING_SCENE_ID, { resume: true, client });
});

bot.command('extend', async (ctx) => {
  const client = await getClientByTelegramId(ctx.from.id);
  if (!client) return ctx.reply('Сначала пройди анкету: /start');

  if (client.survey_strategy === 'long') {
    return ctx.reply('Ты уже проходил(а) полную анкету — расширять нечего.');
  }
  if (client.survey_strategy !== 'short' || client.status !== 'questionnaire_completed') {
    return ctx.reply('Сначала закончи текущую анкету: /continue');
  }

  const delta = await getStrategyDelta('short', 'long');
  const answeredCount = await getAnsweredCount(client.id, 2);
  if (answeredCount >= delta.length) {
    await upgradeStrategy(client.id, 'long');
    return ctx.reply('Расширенная анкета уже пройдена.');
  }

  return ctx.scene.enter(ONBOARDING_SCENE_ID, {
    resumeExtend: true,
    clientId: client.id,
    questions: delta,
    qi: answeredCount,
  });
});

bot.help((ctx) => {
  ctx.reply(
    'Команды:\n/start — начать анкету\n/continue — продолжить незаконченную анкету\n' +
      '/extend — пройти расширенную анкету (после короткой)\n/newsurvey — пройти анкету заново (новый раунд)\n' +
      '/addmeasurement — записать замеры\n/measurements — мои замеры\n' +
      '/help — эта справка\n/whoami — узнать свой Telegram ID\n\n' +
      'Залы и оборудование: /gyms, /gym, /creategym, /addequipment, /showequipment, /classes, /classifyequipment\n\n' +
      'Для админов: /stats, /clients, /editanswer, /logs, /admins, /addadmin, /removeadmin, /groups, /creategroup, /setclientgroup, /setadmingroup, /createclass'
  );
});

registerSurveyCommands(bot, ONBOARDING_SCENE_ID);

registerAdminCommands(bot);
registerGroupCommands(bot);
registerGymCommands(bot);

// Ловит текст от тех, кто сейчас не в сцене — например, сессия пропала после
// перезапуска бота, а анкета была не дозаполнена ("зашёл на следующий день").
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) {
    return ctx.reply('Неизвестная команда. /help — список доступных.');
  }

  const client = await getClientByTelegramId(ctx.from.id);
  if (!client) return ctx.reply('Не понял. Напиши /start, чтобы начать анкету.');

  let unfinished = !client.wants_plan || !client.survey_strategy;
  if (!unfinished) {
    const surveys = await listClientSurveys(client.id);
    unfinished = surveys.some((s) => s.status === 'in_progress');
  }

  if (!unfinished) {
    return ctx.reply('Анкета уже пройдена. Команды — /help.');
  }

  await ctx.reply('С возвращением! Продолжим с того места, где остановились.');
  return ctx.scene.enter(ONBOARDING_SCENE_ID, { resume: true, client });
});

// Раз в 2 недели — напоминание сделать замеры. Планировщика вроде node-cron
// нет и не заводили ради одной задачи: простой ежедневный интервал внутри
// самого процесса бота, отбор "кому пора" — на стороне SQL (listClientsDueForReminder).
const MEASUREMENT_REMINDER_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function sendMeasurementReminders() {
  const due = await listClientsDueForReminder();
  for (const client of due) {
    try {
      await bot.telegram.sendMessage(
        client.telegram_id,
        `Привет, ${client.name}! Прошло 2 недели — самое время сделать новые замеры. /addmeasurement`
      );
      await markReminderSent(client.id);
    } catch (err) {
      console.error(`Не удалось отправить напоминание о замерах клиенту #${client.id}:`, err.message);
    }
  }
}

ensureOwner(OWNER_TELEGRAM_ID)
  .then(() => setDefaultMenu(bot.telegram))
  .then(() => syncAllAdminMenus(bot.telegram))
  .then(() => {
    bot.launch();
    console.log('Бот запущен (long polling).');
    setTimeout(() => sendMeasurementReminders().catch((err) => console.error('Напоминания о замерах:', err)), 60 * 1000);
    setInterval(
      () => sendMeasurementReminders().catch((err) => console.error('Напоминания о замерах:', err)),
      MEASUREMENT_REMINDER_CHECK_INTERVAL_MS
    );
  })
  .catch((err) => {
    console.error('Не удалось запустить бота:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
