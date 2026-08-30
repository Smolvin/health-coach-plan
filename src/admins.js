// Роли в Telegram-боте: 'owner' (один, задаётся через OWNER_TELEGRAM_ID в .env
// и закрепляется при первом запуске бота) и 'admin' (добавляются владельцем или
// другими админами). Обычные клиенты сюда не попадают.
// group_id: NULL — админ видит всех клиентов; иначе — только клиентов этой
// группы (client_groups, см. src/groups.js). Назначает владелец (/setadmingroup).
const pool = require('./db');

async function getAdmin(telegramId) {
  const [rows] = await pool.query(
    'SELECT telegram_id, telegram_username, role, group_id FROM admins WHERE telegram_id = ?',
    [telegramId]
  );
  return rows[0] || null;
}

// Без limit — вернуть всех (так вызывает syncAllAdminMenus при старте бота,
// ему нужны все админы, не только страница). С limit — /admins в веб-админке.
async function listAdmins({ limit, offset = 0 } = {}) {
  const params = [];
  let sql = `SELECT a.telegram_id, a.telegram_username, a.role, a.group_id, g.name AS group_name, a.added_by, a.created_at
     FROM admins a
     LEFT JOIN client_groups g ON g.id = a.group_id
     ORDER BY (a.role = 'owner') DESC, a.created_at ASC`;
  if (limit) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function countAdmins() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM admins');
  return n;
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

async function setAdminGroup(telegramId, groupId) {
  const [result] = await pool.query(`UPDATE admins SET group_id = ? WHERE telegram_id = ? AND role <> 'owner'`, [
    groupId,
    telegramId,
  ]);
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

module.exports = { getAdmin, listAdmins, countAdmins, addAdmin, removeAdmin, setAdminGroup, ensureOwner };
