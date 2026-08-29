// Группы клиентов — владелец распределяет админов по группам (src/admins.js:
// setAdminGroup), чтобы ограничить, каких клиентов админ видит в /clients,
// /editanswer, /logs. group_id = NULL у админа значит «видит всех».
const pool = require('./db');

async function listGroups() {
  const [rows] = await pool.query(
    `SELECT g.id, g.code, g.name, COUNT(c.id) AS client_count
     FROM client_groups g
     LEFT JOIN clients c ON c.group_id = g.id
     GROUP BY g.id
     ORDER BY g.name`
  );
  return rows;
}

async function createGroup(code, name) {
  await pool.query('INSERT INTO client_groups (code, name) VALUES (?, ?)', [code, name]);
}

async function getGroupByCode(code) {
  const [rows] = await pool.query('SELECT id, code, name FROM client_groups WHERE code = ?', [code]);
  return rows[0] || null;
}

module.exports = { listGroups, createGroup, getGroupByCode };
