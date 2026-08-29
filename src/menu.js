// Кнопка меню в Telegram (список команд рядом с полем ввода) — разная для
// обычных клиентов, админов и владельца. Обычным клиентам meню общее (задаётся
// один раз через setMyCommands без scope), админам/владельцу — персональное,
// через scope { type: 'chat', chat_id }, поэтому обновляется сразу при
// добавлении/удалении админа, без ожидания, пока человек напишет боту снова.
const { listAdmins } = require('./admins');

const CLIENT_COMMANDS = [
  { command: 'start', description: 'Начать анкету' },
  { command: 'continue', description: 'Продолжить незаконченную анкету' },
  { command: 'extend', description: 'Пройти расширенную анкету' },
  { command: 'help', description: 'Справка' },
  { command: 'whoami', description: 'Мой Telegram ID' },
  { command: 'gyms', description: 'Список залов' },
  { command: 'gym', description: 'Инфо и оборудование зала' },
  { command: 'creategym', description: 'Завести новый зал' },
  { command: 'addequipment', description: 'Добавить фото оборудования в зал' },
  { command: 'showequipment', description: 'Показать фото оборудования' },
  { command: 'classes', description: 'Список классов оборудования' },
  { command: 'classifyequipment', description: 'Указать класс оборудования' },
];

const ADMIN_EXTRA_COMMANDS = [
  { command: 'stats', description: 'Статистика по клиентам' },
  { command: 'clients', description: 'Список клиентов' },
  { command: 'editanswer', description: 'Изменить ответ клиента' },
  { command: 'logs', description: 'Журнал правок ответов' },
  { command: 'admins', description: 'Список админов' },
  { command: 'addadmin', description: 'Добавить админа' },
  { command: 'groups', description: 'Список групп клиентов' },
  { command: 'setclientgroup', description: 'Назначить клиенту группу' },
  { command: 'createclass', description: 'Создать класс оборудования' },
];

const OWNER_EXTRA_COMMANDS = [
  { command: 'removeadmin', description: 'Удалить админа' },
  { command: 'creategroup', description: 'Создать группу клиентов' },
  { command: 'setadmingroup', description: 'Задать область видимости админу' },
];

function commandsForRole(role) {
  if (role === 'owner') return [...CLIENT_COMMANDS, ...ADMIN_EXTRA_COMMANDS, ...OWNER_EXTRA_COMMANDS];
  if (role === 'admin') return [...CLIENT_COMMANDS, ...ADMIN_EXTRA_COMMANDS];
  return CLIENT_COMMANDS;
}

async function setDefaultMenu(telegram) {
  await telegram.setMyCommands(CLIENT_COMMANDS);
}

async function setMenuForUser(telegram, telegramId, role) {
  await telegram.setMyCommands(commandsForRole(role), { scope: { type: 'chat', chat_id: telegramId } });
}

async function resetMenuForUser(telegram, telegramId) {
  await telegram.deleteMyCommands({ scope: { type: 'chat', chat_id: telegramId } });
}

// При старте бота — раскладывает персональное меню всем, кто уже в admins
// (включая владельца, которого только что закрепил ensureOwner).
async function syncAllAdminMenus(telegram) {
  const admins = await listAdmins();
  for (const admin of admins) {
    await setMenuForUser(telegram, admin.telegram_id, admin.role);
  }
}

module.exports = { setDefaultMenu, setMenuForUser, resetMenuForUser, syncAllAdminMenus };
