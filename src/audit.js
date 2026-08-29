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
async function listEditLogs({ clientIds = null, editedBy = null, limit = 20 } = {}) {
  let where = '';
  const params = [];
  if (clientIds) {
    where = `WHERE (l.client_id IN (${clientIds.length ? clientIds.map(() => '?').join(',') : 'SELECT 0'}) OR l.edited_by = ?)`;
    params.push(...clientIds, editedBy);
  }
  const [rows] = await pool.query(
    `SELECT l.*, c.name AS client_name
     FROM answer_edit_log l
     JOIN clients c ON c.id = l.client_id
     ${where}
     ORDER BY l.edited_at DESC
     LIMIT ?`,
    [...params, limit]
  );
  return rows;
}

module.exports = { logAnswerEdit, listEditLogs };
