// Роли в Telegram-боте: 'owner' (один, задаётся через OWNER_TELEGRAM_ID в .env
// и закрепляется при первом запуске бота) и 'admin' (добавляются владельцем или
// другими админами). Обычные клиенты сюда не попадают.
const pool = require('./db');

async function getAdmin(telegramId) {
  const [rows] = await pool.query('SELECT telegram_id, telegram_username, role FROM admins WHERE telegram_id = ?', [
    telegramId,
  ]);
  return rows[0] || null;
}

async function listAdmins() {
  const [rows] = await pool.query(
    `SELECT telegram_id, telegram_username, role, added_by, created_at
     FROM admins
     ORDER BY (role = 'owner') DESC, created_at ASC`
  );
  return rows;
}

async function addAdmin(telegramId, telegramUsername, addedBy) {
  await pool.query(
    `INSERT INTO admins (telegram_id, telegram_username, role, added_by)
     VALUES (?, ?, 'admin', ?)
     ON DUPLICATE KEY UPDATE telegram_username = VALUES(telegram_username)`,
    [telegramId, telegramUsername || null, addedBy || null]
  );
}

async function removeAdmin(telegramId) {
  const [result] = await pool.query(`DELETE FROM admins WHERE telegram_id = ? AND role <> 'owner'`, [telegramId]);
  return result.affectedRows > 0;
}

// Идемпотентно: если владелец уже закреплён (в т.ч. за другим telegram_id —
// например, .env поменяли), ничего не делает.
async function ensureOwner(telegramId) {
  if (!telegramId) return;
  const [rows] = await pool.query(`SELECT id FROM admins WHERE role = 'owner' LIMIT 1`);
  if (rows.length) return;
  await pool.query(
    `INSERT INTO admins (telegram_id, role) VALUES (?, 'owner')
     ON DUPLICATE KEY UPDATE role = 'owner'`,
    [telegramId]
  );
}

module.exports = { getAdmin, listAdmins, addAdmin, removeAdmin, ensureOwner };
