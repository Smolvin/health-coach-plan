// Кнопка меню в Telegram (список команд рядом с полем ввода) — разная для
// обычных клиентов, админов и владельца. Обычным клиентам меню общее (задаётся
// один раз через setMyCommands без scope), админам/владельцу — персональное,
// через scope { type: 'chat', chat_id }, поэтому обновляется сразу при
// добавлении/удалении админа, без ожидания, пока человек напишет боту снова.
// Состав команд по ролям — в БД (src/menu-config.js, веб-страница /menu),
// не хардкод.
const { listAdmins } = require('./admins');
const { getAssembledCommands } = require('./menu-config');

async function setDefaultMenu(telegram) {
  const commands = await getAssembledCommands('client');
  await telegram.setMyCommands(commands);
}

async function setMenuForUser(telegram, telegramId, role) {
  const commands = await getAssembledCommands(role);
  await telegram.setMyCommands(commands, { scope: { type: 'chat', chat_id: telegramId } });
}

async function resetMenuForUser(telegram, telegramId) {
  await telegram.deleteMyCommands({ scope: { type: 'chat', chat_id: telegramId } });
}

// При старте бота (и после правки состава меню в веб-админке) — раскладывает
// персональное меню всем, кто уже в admins (включая владельца).
async function syncAllAdminMenus(telegram) {
  const admins = await listAdmins();
  for (const admin of admins) {
    await setMenuForUser(telegram, admin.telegram_id, admin.role);
  }
}

module.exports = { setDefaultMenu, setMenuForUser, resetMenuForUser, syncAllAdminMenus };
