// Команды кнопки меню бота, настраиваемые из БД (веб-админка, /menu) —
// раньше были три хардкод-массива в src/menu.js. tier — тот же принцип, что
// был: 'client' видят все, 'admin' — админы и владелец, 'owner' — только
// владелец. Редактирование состава меню не создаёт и не удаляет сами команды
// бота (bot.command(...) в коде) — только то, что показывается в кнопке меню.
const pool = require('./db');

async function listAllCommands() {
  const [rows] = await pool.query('SELECT * FROM bot_menu_commands ORDER BY tier, position, id');
  return rows;
}

async function listByTier(tier) {
  const [rows] = await pool.query(
    'SELECT command, description FROM bot_menu_commands WHERE tier = ? AND active = 1 ORDER BY position, id',
    [tier]
  );
  return rows;
}

// owner видит client+admin+owner, admin — client+admin, client — только client.
async function getAssembledCommands(role) {
  const tiers = role === 'owner' ? ['client', 'admin', 'owner'] : role === 'admin' ? ['client', 'admin'] : ['client'];
  const rows = await Promise.all(tiers.map((tier) => listByTier(tier)));
  return rows.flat();
}

async function getCommandById(id) {
  const [rows] = await pool.query('SELECT * FROM bot_menu_commands WHERE id = ?', [id]);
  return rows[0] || null;
}

async function createCommand({ tier, command, description, position }) {
  await pool.query('INSERT INTO bot_menu_commands (tier, command, description, position) VALUES (?, ?, ?, ?)', [
    tier,
    command.replace(/^\//, ''),
    description,
    position || 0,
  ]);
}

async function updateCommand(id, { description, position, active }) {
  await pool.query('UPDATE bot_menu_commands SET description = ?, position = ?, active = ? WHERE id = ?', [
    description,
    position || 0,
    active ? 1 : 0,
    id,
  ]);
}

async function deleteCommand(id) {
  await pool.query('DELETE FROM bot_menu_commands WHERE id = ?', [id]);
}

module.exports = {
  listAllCommands,
  listByTier,
  getAssembledCommands,
  getCommandById,
  createCommand,
  updateCommand,
  deleteCommand,
};
