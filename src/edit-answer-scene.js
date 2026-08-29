// Диалог правки конкретного ответа клиента админом: /editanswer показывает
// пронумерованный список ответов и заводит в эту сцену; дальше — номер вопроса,
// потом новый текст. Каждая правка пишется в answer_edit_log (src/audit.js).
const { Scenes, Markup } = require('telegraf');
const { saveAnswer } = require('./clients');
const { logAnswerEdit } = require('./audit');

const EDIT_ANSWER_SCENE_ID = 'edit_answer';
const editAnswerScene = new Scenes.BaseScene(EDIT_ANSWER_SCENE_ID);

editAnswerScene.enter((ctx) => {
  ctx.scene.state.step = 'pick';
});

editAnswerScene.on('text', async (ctx) => {
  const state = ctx.scene.state;
  const text = ctx.message.text.trim();

  if (text === '/cancel') {
    await ctx.reply('Отменено.', Markup.removeKeyboard());
    return ctx.scene.leave();
  }

  if (state.step === 'pick') {
    const idx = Number(text) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= state.answers.length) {
      return ctx.reply(`Пришли число от 1 до ${state.answers.length} (или /cancel).`);
    }
    state.pickedIndex = idx;
    state.step = 'value';
    const a = state.answers[idx];
    return ctx.reply(`Вопрос: ${a.question_text}\nТекущий ответ: ${a.answer_text}\n\nПришли новый ответ (или /cancel).`);
  }

  if (state.step === 'value') {
    const a = state.answers[state.pickedIndex];
    const oldAnswer = a.answer_text;

    await saveAnswer(state.clientId, a.round, a.question_number, a.question_text, text);
    await logAnswerEdit({
      clientId: state.clientId,
      round: a.round,
      questionNumber: a.question_number,
      questionText: a.question_text,
      oldAnswer,
      newAnswer: text,
      editedBy: state.editorId,
    });

    await ctx.reply(`Готово. Было: «${oldAnswer}» → стало: «${text}».`, Markup.removeKeyboard());
    return ctx.scene.leave();
  }
});

module.exports = { EDIT_ANSWER_SCENE_ID, editAnswerScene };
