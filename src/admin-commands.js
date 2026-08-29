// Админ-команды прямо в Telegram-боте — второй (наряду с веб-админкой) вход для
// администраторов: статистика по клиентам/анкетам, список клиентов, управление
// списком админов. Обычным клиентам эти команды недоступны.
const { getAdmin, listAdmins, addAdmin, removeAdmin } = require('./admins');
const { listClients, getStats, findClientByUsername } = require('./clients');

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ');
}

function registerAdminCommands(bot) {
  bot.command('whoami', (ctx) => {
    ctx.reply(
      `Твой Telegram ID: ${ctx.from.id}\nUsername: ${ctx.from.username ? '@' + ctx.from.username : '—'}\n\n` +
        'Этот ID понадобится, чтобы тебя добавили в админы (/addadmin) или назначили владельцем (OWNER_TELEGRAM_ID в .env).'
    );
  });

  bot.command('stats', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    const stats = await getStats();
    const byStatus = stats.byStatus.map((r) => `  ${r.status}: ${r.n}`).join('\n') || '  —';
    const byStrategy = stats.byStrategy.map((r) => `  ${r.survey_strategy}: ${r.n}`).join('\n') || '  —';

    ctx.reply(
      `Клиентов всего: ${stats.total}\n` +
        `Ответов на анкету сохранено: ${stats.totalAnswers}\n\n` +
        `По статусу:\n${byStatus}\n\n` +
        `По стратегии анкеты:\n${byStrategy}`
    );
  });

  bot.command('clients', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    const clients = await listClients({ limit: 30 });
    if (!clients.length) return ctx.reply('Клиентов пока нет.');

    const lines = clients.map(
      (c) =>
        `#${c.id} ${c.name} (${c.city}) — ${c.status}` +
        `${c.survey_strategy ? `, ${c.survey_strategy}` : ''} — ${formatDate(c.created_at)}`
    );
    ctx.reply(`Последние клиенты (до 30):\n\n${lines.join('\n')}`);
  });

  bot.command('admins', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    const admins = await listAdmins();
    const lines = admins.map(
      (a) =>
        `${a.role === 'owner' ? '👑 владелец' : '🛡 админ'} — ` +
        `${a.telegram_username ? '@' + a.telegram_username : a.telegram_id} (id ${a.telegram_id})`
    );
    ctx.reply(`Админы (${admins.length}):\n\n${lines.join('\n')}`);
  });

  bot.command('addadmin', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!arg) {
      return ctx.reply(
        'Использование: /addadmin <telegram_id или @username>\n' +
          '(по @username сработает, только если человек уже писал боту хотя бы раз — иначе нужен числовой ID, его можно узнать командой /whoami у самого человека)'
      );
    }

    let targetId;
    let targetUsername = null;
    if (/^\d+$/.test(arg)) {
      targetId = Number(arg);
    } else {
      const client = await findClientByUsername(arg);
      if (!client) {
        return ctx.reply(
          'Не нашёл такого пользователя среди тех, кто уже писал боту. ' +
            'Попроси его сначала отправить боту /start, либо укажи числовой Telegram ID (команда /whoami).'
        );
      }
      targetId = client.telegram_id;
      targetUsername = client.telegram_username;
    }

    await addAdmin(targetId, targetUsername, ctx.from.id);
    ctx.reply(`Готово: ${targetUsername ? '@' + targetUsername : targetId} теперь админ.`);
  });

  bot.command('removeadmin', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');
    if (admin.role !== 'owner') return ctx.reply('Удалять админов может только владелец.');

    const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!/^\d+$/.test(arg)) return ctx.reply('Использование: /removeadmin <telegram_id> (id можно взять из /admins)');

    const removed = await removeAdmin(Number(arg));
    ctx.reply(removed ? 'Готово, убрал из админов.' : 'Не нашёл такого админа (или это владелец — его удалить нельзя).');
  });
}

module.exports = { registerAdminCommands };
