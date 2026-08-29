// Админ-команды прямо в Telegram-боте — второй (наряду с веб-админкой) вход для
// администраторов: статистика по клиентам/анкетам, список клиентов, управление
// списком админов. Обычным клиентам эти команды недоступны.
const { getAdmin, listAdmins, addAdmin, removeAdmin } = require('./admins');
const { listClients, getClient, getClientAnswers, getStats, findClientByUsername } = require('./clients');
const { setMenuForUser, resetMenuForUser } = require('./menu');
const { canSeeClient } = require('./access');
const { listEditLogs } = require('./audit');
const { EDIT_ANSWER_SCENE_ID } = require('./edit-answer-scene');

// group_id админа (или null для владельца/неограниченного админа) — фильтр,
// который нужно применить к спискам клиентов.
function scopeGroupId(admin) {
  return admin.role === 'owner' ? null : admin.group_id;
}

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

    const clients = await listClients({ limit: 30, groupId: scopeGroupId(admin) });
    if (!clients.length) return ctx.reply('Клиентов пока нет (в твоей области видимости).');

    const lines = clients.map(
      (c) =>
        `#${c.id} ${c.name} (${c.city}) — ${c.status}` +
        `${c.survey_strategy ? `, ${c.survey_strategy}` : ''} — ${formatDate(c.created_at)}`
    );
    const scopeNote = admin.role !== 'owner' && admin.group_id ? ' (только твоя группа)' : ' (все клиенты)';
    ctx.reply(`Последние клиенты (до 30)${scopeNote}:\n\n${lines.join('\n')}`);
  });

  bot.command('admins', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    const admins = await listAdmins();
    const lines = admins.map(
      (a) =>
        `${a.role === 'owner' ? '👑 владелец' : '🛡 админ'} — ` +
        `${a.telegram_username ? '@' + a.telegram_username : a.telegram_id} (id ${a.telegram_id})` +
        ` — ${a.role === 'owner' ? 'видит всех' : a.group_name ? `группа «${a.group_name}»` : 'видит всех'}`
    );
    ctx.reply(`Админы (${admins.length}):\n\n${lines.join('\n')}`);
  });

  bot.command('editanswer', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    const arg = ctx.message.text.split(' ')[1];
    if (!arg) return ctx.reply('Использование: /editanswer <client_id> (id смотри в /clients)');

    const client = await getClient(arg);
    if (!client) return ctx.reply('Клиент не найден.');
    if (!canSeeClient(admin, client)) return ctx.reply('Нет доступа — этот клиент не из твоей группы.');

    const answers = await getClientAnswers(client.id);
    if (!answers.length) return ctx.reply('У этого клиента пока нет ответов.');

    const list = answers.map((a, i) => `${i + 1}. [раунд ${a.round}] ${a.question_text}\n   ответ: ${a.answer_text}`);
    await ctx.reply(
      `Ответы клиента #${client.id} ${client.name}:\n\n${list.join('\n\n')}\n\n` +
        'Пришли номер ответа, который нужно изменить (или /cancel).'
    );
    return ctx.scene.enter(EDIT_ANSWER_SCENE_ID, { clientId: client.id, answers, editorId: ctx.from.id });
  });

  bot.command('logs', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');

    let clientIds = null;
    if (admin.role !== 'owner' && admin.group_id) {
      const groupClients = await listClients({ limit: 1000, groupId: admin.group_id });
      clientIds = groupClients.map((c) => c.id);
    }

    const logs = await listEditLogs({ clientIds, editedBy: ctx.from.id, limit: 20 });
    if (!logs.length) return ctx.reply('Правок пока нет.');

    const lines = logs.map(
      (l) =>
        `#${l.id} ${formatDate(l.edited_at)} — клиент #${l.client_id} ${l.client_name}, вопрос ${l.question_number} (раунд ${l.round})\n` +
        `  было: ${l.old_answer}\n  стало: ${l.new_answer}\n  правил: ${l.edited_by}`
    );
    const scopeNote = admin.role === 'owner' ? '(все)' : admin.group_id ? '(твоя группа + твои правки)' : '(все)';
    ctx.reply(`Последние правки ${scopeNote} (до 20):\n\n${lines.join('\n\n')}`);
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
    await setMenuForUser(ctx.telegram, targetId, 'admin');
    ctx.reply(`Готово: ${targetUsername ? '@' + targetUsername : targetId} теперь админ, меню команд у него обновилось.`);
  });

  bot.command('removeadmin', async (ctx) => {
    const admin = await getAdmin(ctx.from.id);
    if (!admin) return ctx.reply('Команда только для админов.');
    if (admin.role !== 'owner') return ctx.reply('Удалять админов может только владелец.');

    const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!/^\d+$/.test(arg)) return ctx.reply('Использование: /removeadmin <telegram_id> (id можно взять из /admins)');

    const removed = await removeAdmin(Number(arg));
    if (removed) await resetMenuForUser(ctx.telegram, Number(arg));
    ctx.reply(removed ? 'Готово, убрал из админов, меню вернул обычное.' : 'Не нашёл такого админа (или это владелец — его удалить нельзя).');
  });
}

module.exports = { registerAdminCommands };
