const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const pool = require('./db');
const { listStrategies, getQuestions } = require('./survey');

const ONBOARDING_SCENE_ID = 'onboarding';

const YES_NO_KEYBOARD = Markup.keyboard(['Да', 'Нет'], { columns: 2 }).oneTime().resize();

function parseBirthDate(text) {
  const dmy = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const ymd = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return text.trim();
  return null;
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

async function upsertClient(state, telegramId, telegramUsername) {
  await pool.query(
    `INSERT INTO clients (telegram_id, telegram_username, name, city, birth_date, wants_plan, survey_strategy, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'card_created')
     ON DUPLICATE KEY UPDATE
       telegram_username = VALUES(telegram_username),
       name = VALUES(name),
       city = VALUES(city),
       birth_date = VALUES(birth_date),
       wants_plan = VALUES(wants_plan),
       survey_strategy = VALUES(survey_strategy),
       status = IF(status = 'questionnaire_completed', status, 'card_created')`,
    [
      telegramId,
      telegramUsername || null,
      state.name,
      state.city,
      state.birthDate,
      state.wantsPlan ? 1 : 0,
      state.strategyCode || null,
    ]
  );
  const [rows] = await pool.query('SELECT id FROM clients WHERE telegram_id = ?', [telegramId]);
  return rows[0].id;
}

async function saveAnswer(clientId, questionNumber, questionText, answerText) {
  await pool.query(
    `INSERT INTO questionnaire_answers (client_id, round, question_number, question_text, answer_text, answered_at)
     VALUES (?, 1, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text), answered_at = NOW()`,
    [clientId, questionNumber, questionText, answerText]
  );
}

async function markCompleted(clientId) {
  await pool.query(`UPDATE clients SET status = 'questionnaire_completed' WHERE id = ?`, [clientId]);
}

const onboardingScene = new Scenes.BaseScene(ONBOARDING_SCENE_ID);

onboardingScene.enter((ctx) => {
  ctx.scene.state.step = 'name';
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
      state.qi = 0;

      try {
        state.clientId = await upsertClient(state, ctx.from.id, ctx.from.username);
      } catch (err) {
        console.error('Ошибка сохранения карточки клиента:', err);
        return ctx.reply('Не удалось сохранить данные, попробуй ещё раз чуть позже.');
      }

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
        await saveAnswer(state.clientId, state.qi + 1, question.text, answer);
      } catch (err) {
        console.error('Ошибка сохранения ответа:', err);
        return ctx.reply('Не удалось сохранить ответ, попробуй прислать его ещё раз.');
      }

      state.qi += 1;
      if (state.qi < state.questions.length) {
        return askQuestion(ctx, state.questions[state.qi], state.qi, state.questions.length);
      }

      await markCompleted(state.clientId);
      await ctx.reply(
        'Спасибо! Анкета заполнена — все ответы сохранены. Скоро вернусь с программой тренировок и планом питания.',
        Markup.removeKeyboard()
      );
      return ctx.scene.leave();
    }

    default:
      return ctx.scene.leave();
  }
});

const stage = new Scenes.Stage([onboardingScene]);

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => ctx.scene.enter(ONBOARDING_SCENE_ID));

bot.help((ctx) => {
  ctx.reply('Команды:\n/start — начать анкету\n/help — эта справка');
});

bot.launch();
console.log('Бот запущен (long polling).');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
