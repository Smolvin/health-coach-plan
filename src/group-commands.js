// Команды управления группами клиентов: /groups (все админы, просмотр),
// /creategroup и /setadmingroup (только владелец), /setclientgroup (любой админ).
const { getAdmin, setAdminGroup } = require('./admins');
const { listGroups, createGroup, getGroupByCode } = require('./groups');
const { getClient, setClientGroup } = require('./clients');

function registerGroupCommands(bot) {
  bot.command('groups', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    const groups = await listGroups();
    if (!groups.length) {
      return ctx.reply('Групп пока нет. Создать: /creategroup <код> <название> (только владелец).');
    }
    const lines = groups.map((g) => `${g.code} — ${g.name} (клиентов: ${g.client_count})`);
    ctx.reply(`Группы клиентов:\n\n${lines.join('\n')}`);
  });

  bot.command('creategroup', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');
    if (admin.role !== 'owner') return ctx.reply('Создавать группы может только владелец.');

    const parts = ctx.message.text.split(' ').slice(1);
    const code = parts[0];
    const name = parts.slice(1).join(' ').trim();
    if (!code || !name) return ctx.reply('Использование: /creategroup <код> <название>');

    await createGroup(code, name);
    ctx.reply(`Группа «${name}» (${code}) создана. Назначить клиента: /setclientgroup <client_id> ${code}`);
  });

  bot.command('setclientgroup', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    const [clientIdRaw, code] = ctx.message.text.split(' ').slice(1);
    if (!clientIdRaw || !code) return ctx.reply('Использование: /setclientgroup <client_id> <код группы или none>');

    const client = await getClient(clientIdRaw);
    if (!client) return ctx.reply('Клиент не найден.');

    if (code === 'none') {
      await setClientGroup(client.id, null);
      return ctx.reply(`У клиента #${client.id} убрана группа.`);
    }

    const group = await getGroupByCode(code);
    if (!group) return ctx.reply('Такой группы нет. Список: /groups');

    await setClientGroup(client.id, group.id);
    ctx.reply(`Клиент #${client.id} теперь в группе «${group.name}».`);
  });

  bot.command('setadmingroup', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');
    if (admin.role !== 'owner') return ctx.reply('Назначать область видимости админам может только владелец.');

    const [targetIdRaw, code] = ctx.message.text.split(' ').slice(1);
    if (!targetIdRaw || !/^\d+$/.test(targetIdRaw) || !code) {
      return ctx.reply('Использование: /setadmingroup <telegram_id> <код группы или all>');
    }
    const targetId = Number(targetIdRaw);

    if (code === 'all') {
      const ok = await setAdminGroup(targetId, null);
      return ctx.reply(ok ? `Админ ${targetId} теперь видит всех клиентов.` : 'Не нашёл такого админа (или это владелец).');
    }

    const group = await getGroupByCode(code);
    if (!group) return ctx.reply('Такой группы нет. Список: /groups');

    const ok = await setAdminGroup(targetId, group.id);
    ctx.reply(
      ok
        ? `Админ ${targetId} теперь видит только группу «${group.name}».`
        : 'Не нашёл такого админа (или это владелец).'
    );
  });
}

module.exports = { registerGroupCommands };
