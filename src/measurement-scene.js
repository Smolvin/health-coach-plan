// Диалог записи замеров: /addmeasurement спрашивает параметр (кнопками из
// measurement_types), потом значение, потом снова параметр — пока клиент не
// пришлёт /done. Каждый параметр можно вносить сколько угодно раз за сессию.
const { Scenes, Markup } = require('telegraf');
const measurements = require('./measurements');

const ADD_MEASUREMENT_SCENE_ID = 'add_measurement';

function typeLabel(t) {
  return `${t.name}${t.unit ? ` (${t.unit})` : ''}`;
}

async function askType(ctx) {
  const types = await measurements.listTypes();
  ctx.scene.state.step = 'pick';
  return ctx.reply(
    'Какой параметр замеряем? (или /done, если закончил)',
    Markup.keyboard(types.map(typeLabel), { columns: 2 }).oneTime().resize()
  );
}

const addMeasurementScene = new Scenes.BaseScene(ADD_MEASUREMENT_SCENE_ID);

addMeasurementScene.enter((ctx) => askType(ctx));

addMeasurementScene.on('text', async (ctx) => {
  const state = ctx.scene.state;
  const text = ctx.message.text.trim();

  if (text === '/done') {
    await ctx.reply('Готово, замеры сохранены. Спасибо!', Markup.removeKeyboard());
    return ctx.scene.leave();
  }

  if (state.step === 'pick') {
    const types = await measurements.listTypes();
    const match = types.find((t) => typeLabel(t) === text);
    if (!match) return askType(ctx);

    state.typeId = match.id;
    state.typeName = match.name;
    state.unit = match.unit || '';
    state.step = 'value';
    return ctx.reply(`Значение (${state.unit || 'число'})?`, Markup.removeKeyboard());
  }

  if (state.step === 'value') {
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value)) return ctx.reply('Пришли число, например 82.5 (или /done, чтобы закончить).');

    await measurements.addMeasurement(state.clientId, state.typeId, value, new Date());
    await ctx.reply(`Записал: ${state.typeName} — ${value}${state.unit}.`);
    return askType(ctx);
  }
});

module.exports = { ADD_MEASUREMENT_SCENE_ID, addMeasurementScene };
