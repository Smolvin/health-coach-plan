// Команды залов/оборудования — доступны и клиентам, и админам (зал заводит
// "пользователь или админ"); классификация — тот, кто загрузил фото, или любой
// админ; заводить сами классы оборудования (справочник) — только админы.
const { getAdmin } = require('./admins');
const { listGyms, getGym } = require('./gyms');
const { listClasses, createClass, getClassByCode, listGymEquipment, getEquipment, classify } = require('./equipment');
const { CREATE_GYM_SCENE_ID, ADD_EQUIPMENT_SCENE_ID } = require('./gym-scenes');

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ');
}

function registerGymCommands(bot) {
  bot.command('creategym', (ctx) => ctx.scene.enter(CREATE_GYM_SCENE_ID));

  bot.command('gyms', async (ctx) => {
    const gyms = await listGyms();
    if (!gyms.length) return ctx.reply('Залов пока нет. Завести: /creategym');
    const lines = gyms.map(
      (g) =>
        `#${g.id} ${g.name} — ${g.type === 'template' ? 'типовой' : g.location || 'без адреса'}` +
        ` (оборудования: ${g.equipment_count})`
    );
    ctx.reply(`Залы:\n\n${lines.join('\n')}\n\nПодробнее: /gym <id>`);
  });

  bot.command('gym', async (ctx) => {
    const arg = ctx.message.text.split(' ')[1];
    if (!arg) return ctx.reply('Использование: /gym <id> (список залов — /gyms)');
    const gym = await getGym(arg);
    if (!gym) return ctx.reply('Зал не найден.');

    const items = await listGymEquipment(gym.id);
    const lines = items.map(
      (e) => `#${e.id} ${e.name || '(без названия)'} — ${e.class_name ? e.class_name : 'не классифицировано'}`
    );

    ctx.reply(
      `Зал #${gym.id}: ${gym.name}\n` +
        `${gym.type === 'template' ? 'Тип: типовой' : `Локация: ${gym.location || '—'}`}\n\n` +
        `Оборудование (${items.length}):\n${lines.join('\n') || '  пока нет — /addequipment ' + gym.id}\n\n` +
        'Посмотреть фото: /showequipment <id>'
    );
  });

  bot.command('addequipment', async (ctx) => {
    const arg = ctx.message.text.split(' ')[1];
    if (!arg) return ctx.reply('Использование: /addequipment <gym_id> (список залов — /gyms)');
    const gym = await getGym(arg);
    if (!gym) return ctx.reply('Зал не найден.');
    return ctx.scene.enter(ADD_EQUIPMENT_SCENE_ID, { gymId: gym.id });
  });

  bot.command('showequipment', async (ctx) => {
    const arg = ctx.message.text.split(' ')[1];
    if (!arg) return ctx.reply('Использование: /showequipment <id>');
    const item = await getEquipment(arg);
    if (!item) return ctx.reply('Не найдено.');
    const caption =
      `#${item.id} ${item.name || ''} — зал «${item.gym_name}»` +
      (item.class_name ? `\nКласс: ${item.class_name}` : '\nНе классифицировано');
    return ctx.replyWithPhoto(item.photo_file_id, { caption });
  });

  bot.command('classes', async (ctx) => {
    const list = await listClasses();
    if (!list.length) return ctx.reply('Классов оборудования пока нет. Создать (админ): /createclass <код> <название>');
    const lines = list.map((c) => `${c.code} — ${c.name}`);
    ctx.reply(`Классы оборудования:\n\n${lines.join('\n')}`);
  });

  bot.command('createclass', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Заводить классы оборудования могут только админы.');
    const parts = ctx.message.text.split(' ').slice(1);
    const code = parts[0];
    const name = parts.slice(1).join(' ').trim();
    if (!code || !name) return ctx.reply('Использование: /createclass <код> <название>');
    await createClass(code, name);
    ctx.reply(`Класс «${name}» (${code}) создан.`);
  });

  bot.command('classifyequipment', async (ctx) => {
    const [idRaw, code, ...nameParts] = ctx.message.text.split(' ').slice(1);
    if (!idRaw || !code) return ctx.reply('Использование: /classifyequipment <id> <код класса> [название]');

    const item = await getEquipment(idRaw);
    if (!item) return ctx.reply('Оборудование не найдено.');

    const admin = await getAdmin(ctx.from.id);
    if (!admin && item.added_by !== ctx.from.id) {
      return ctx.reply('Классифицировать может только тот, кто загрузил фото, или админ.');
    }

    const equipmentClass = await getClassByCode(code);
    if (!equipmentClass) return ctx.reply('Такого класса нет. Список: /classes (создать — /createclass, только админ)');

    await classify(item.id, equipmentClass.id, nameParts.join(' ').trim() || null);
    ctx.reply(`Готово: #${item.id} теперь класса «${equipmentClass.name}».`);
  });
}

module.exports = { registerGymCommands };
