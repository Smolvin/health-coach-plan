// Два диалога: завести зал (/creategym) и загрузить в него фото оборудования
// (/addequipment) — оба многошаговые, поэтому сцены, а не одиночные команды.
const { Scenes, Markup } = require('telegraf');
const { createGym } = require('./gyms');
const { addPhoto } = require('./equipment');
const { ensureGymFolder, uploadEquipmentPhoto } = require('./media');

const CREATE_GYM_SCENE_ID = 'create_gym';
const ADD_EQUIPMENT_SCENE_ID = 'add_equipment';

const TYPE_KEYBOARD = Markup.keyboard(['Локация', 'Типовой'], { columns: 2 }).oneTime().resize();

const createGymScene = new Scenes.BaseScene(CREATE_GYM_SCENE_ID);

createGymScene.enter((ctx) => {
  ctx.scene.state.step = 'name';
  ctx.reply('Как назовём зал?', Markup.removeKeyboard());
});

createGymScene.on('text', async (ctx) => {
  const state = ctx.scene.state;
  const text = ctx.message.text.trim();

  if (state.step === 'name') {
    state.name = text;
    state.step = 'type';
    return ctx.reply(
      'Это зал под конкретную локацию (свой адрес) или типовой набор оборудования (шаблон, без адреса)?',
      TYPE_KEYBOARD
    );
  }

  if (state.step === 'type') {
    if (text === 'Локация') {
      state.type = 'location';
      state.step = 'location';
      return ctx.reply('Адрес или город зала?', Markup.removeKeyboard());
    }
    if (text === 'Типовой') {
      state.type = 'template';
      const gymId = await createGym({ name: state.name, type: 'template', location: null, createdBy: ctx.from.id });
      await ensureGymFolder(gymId).catch((err) => console.error('Не удалось создать папку зала в MinIO:', err.message));
      await ctx.reply(
        `Готово! Зал «${state.name}» создан (#${gymId}, типовой). Добавить оборудование: /addequipment ${gymId}`,
        Markup.removeKeyboard()
      );
      return ctx.scene.leave();
    }
    return ctx.reply('Выбери "Локация" или "Типовой".', TYPE_KEYBOARD);
  }

  if (state.step === 'location') {
    state.location = text;
    const gymId = await createGym({ name: state.name, type: 'location', location: state.location, createdBy: ctx.from.id });
    await ensureGymFolder(gymId).catch((err) => console.error('Не удалось создать папку зала в MinIO:', err.message));
    await ctx.reply(`Готово! Зал «${state.name}» создан (#${gymId}, ${state.location}). Добавить оборудование: /addequipment ${gymId}`);
    return ctx.scene.leave();
  }
});

const addEquipmentScene = new Scenes.BaseScene(ADD_EQUIPMENT_SCENE_ID);

addEquipmentScene.enter((ctx) => {
  ctx.reply(
    'Пришли фото оборудования (можно одно за другим). Подпись к фото станет названием. Когда закончишь — /done.'
  );
});

addEquipmentScene.on('photo', async (ctx) => {
  const state = ctx.scene.state;
  const photos = ctx.message.photo;
  const best = photos[photos.length - 1]; // последний элемент — самое высокое разрешение
  const caption = ctx.message.caption ? ctx.message.caption.trim() : null;

  const equipmentId = await addPhoto({
    gymId: state.gymId,
    photoFileId: best.file_id,
    name: caption,
    addedBy: ctx.from.id,
  });

  let minioNote = '';
  try {
    const fileLink = await ctx.telegram.getFileLink(best.file_id);
    const response = await fetch(fileLink.href || fileLink.toString());
    const buffer = Buffer.from(await response.arrayBuffer());
    await uploadEquipmentPhoto({
      gymId: state.gymId,
      equipmentId,
      buffer,
      contentType: response.headers.get('content-type') || 'image/jpeg',
      telegramFileId: best.file_id,
      uploadedBy: ctx.from.id,
    });
  } catch (err) {
    console.error('Не удалось скопировать фото в MinIO:', err.message);
    minioNote = ' (в постоянное хранилище не скопировалось, но в Telegram сохранено)';
  }

  ctx.reply(
    `Сохранено как #${equipmentId}${caption ? ` («${caption}»)` : ''}${minioNote}. ` +
      `Классифицировать: /classifyequipment ${equipmentId} <код класса>. Присылай следующее фото или /done.`
  );
});

addEquipmentScene.on('text', async (ctx) => {
  if (ctx.message.text.trim() === '/done') {
    await ctx.reply('Готово, закончили добавлять фото в этот зал.');
    return ctx.scene.leave();
  }
  ctx.reply('Жду фото оборудования (или /done, чтобы закончить).');
});

module.exports = { CREATE_GYM_SCENE_ID, createGymScene, ADD_EQUIPMENT_SCENE_ID, addEquipmentScene };
