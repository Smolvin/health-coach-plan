// Снимки состояния клиента (стратегия/статус анкеты + все ответы) и
// копирование данных одного клиента поверх другого с возможностью отката —
// полезно, чтобы админ мог "примерить" реальные данные клиента на свою
// тестовую учётку и потом вернуть её как было.
// Имя/город/telegram_id/группа получателя не трогаются — копируется только
// содержимое анкеты (это не смена личности учётки, а подмена тестовых данных).
const pool = require('./db');
const { getClient, getClientAnswers } = require('./clients');

async function createSnapshot(clientId, reason, createdBy) {
  const client = await getClient(clientId);
  if (!client) throw new Error(`Клиент #${clientId} не найден`);
  const answers = await getClientAnswers(clientId);

  const snapshotData = {
    profile: {
      wants_plan: client.wants_plan,
      survey_strategy: client.survey_strategy,
      status: client.status,
    },
    answers,
  };

  const [result] = await pool.query(
    'INSERT INTO client_snapshots (client_id, snapshot_data, reason, created_by) VALUES (?, ?, ?, ?)',
    [clientId, JSON.stringify(snapshotData), reason || null, createdBy]
  );
  return result.insertId;
}

async function listSnapshots(clientId) {
  const [rows] = await pool.query(
    `SELECT id, reason, created_by, created_at, restored_at
     FROM client_snapshots WHERE client_id = ? ORDER BY created_at DESC`,
    [clientId]
  );
  return rows;
}

async function getSnapshot(id) {
  const [rows] = await pool.query('SELECT * FROM client_snapshots WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const row = rows[0];
  const data = typeof row.snapshot_data === 'string' ? JSON.parse(row.snapshot_data) : row.snapshot_data;
  return { ...row, snapshot_data: data };
}

async function applyProfileAndAnswers(clientId, profile, answers) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE clients SET wants_plan = ?, survey_strategy = ?, status = ? WHERE id = ?', [
      profile.wants_plan ? 1 : 0,
      profile.survey_strategy,
      profile.status,
      clientId,
    ]);
    await connection.query('DELETE FROM questionnaire_answers WHERE client_id = ?', [clientId]);
    for (const a of answers) {
      // answered_at, прошедший через JSON (снимок → восстановление), — это уже
      // ISO-строка, а не JS Date; mysql2 не примет её напрямую для DATETIME.
      const answeredAt = a.answered_at ? new Date(a.answered_at) : null;
      await connection.query(
        `INSERT INTO questionnaire_answers (client_id, round, question_number, question_text, answer_text, answered_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [clientId, a.round, a.question_number, a.question_text, a.answer_text, answeredAt]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Снимает состояние target (для отката), затем перезаписывает его анкету
// данными source. Возвращает id снимка — по нему можно откатить.
async function copyClientData(sourceId, targetId, actorId) {
  if (String(sourceId) === String(targetId)) throw new Error('Источник и получатель совпадают.');

  const source = await getClient(sourceId);
  if (!source) throw new Error(`Клиент-источник #${sourceId} не найден`);
  const target = await getClient(targetId);
  if (!target) throw new Error(`Клиент-получатель #${targetId} не найден`);

  const snapshotId = await createSnapshot(targetId, `перед копированием данных от клиента #${sourceId}`, actorId);

  const sourceAnswers = await getClientAnswers(sourceId);
  await applyProfileAndAnswers(
    targetId,
    { wants_plan: source.wants_plan, survey_strategy: source.survey_strategy, status: source.status },
    sourceAnswers
  );

  return snapshotId;
}

async function restoreSnapshot(snapshotId) {
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) throw new Error(`Снимок #${snapshotId} не найден`);

  await applyProfileAndAnswers(snapshot.client_id, snapshot.snapshot_data.profile, snapshot.snapshot_data.answers);
  await pool.query('UPDATE client_snapshots SET restored_at = NOW() WHERE id = ?', [snapshotId]);
  return snapshot.client_id;
}

module.exports = { createSnapshot, listSnapshots, getSnapshot, copyClientData, restoreSnapshot };
