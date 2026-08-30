// Журнал правок ответов клиентов админами — кто, что именно и когда поменял.
const pool = require('./db');

async function logAnswerEdit({ clientId, round, questionNumber, questionText, oldAnswer, newAnswer, editedBy }) {
  await pool.query(
    `INSERT INTO answer_edit_log (client_id, round, question_number, question_text, old_answer, new_answer, edited_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [clientId, round, questionNumber, questionText, oldAnswer, newAnswer, editedBy]
  );
}

// clientIds — если передан массив, лог ограничивается правками по этим клиентам
// ИЛИ правками, сделанными самим editedBy (доступ «по своим клиентам + себе»
// для админов с ограниченной группой). Если clientIds не передан — лог без
// ограничений (для владельца и админов без группы).
function editLogsWhere({ clientIds, editedBy }) {
  if (!clientIds) return { where: '', params: [] };
  const where = `WHERE (l.client_id IN (${clientIds.length ? clientIds.map(() => '?').join(',') : 'SELECT 0'}) OR l.edited_by = ?)`;
  return { where, params: [...clientIds, editedBy] };
}

async function listEditLogs({ clientIds = null, editedBy = null, limit = 20, offset = 0 } = {}) {
  const { where, params } = editLogsWhere({ clientIds, editedBy });
  const [rows] = await pool.query(
    `SELECT l.*, c.name AS client_name
     FROM answer_edit_log l
     JOIN clients c ON c.id = l.client_id
     ${where}
     ORDER BY l.edited_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

async function countEditLogs({ clientIds = null, editedBy = null } = {}) {
  const { where, params } = editLogsWhere({ clientIds, editedBy });
  const [[{ n }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM answer_edit_log l ${where}`,
    params
  );
  return n;
}

module.exports = { logAnswerEdit, listEditLogs, countEditLogs };
