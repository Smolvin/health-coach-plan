// Проверка подключения к MySQL с текущими настройками из .env (см. src/config.js).
// Использование: npm run db:check
const pool = require('../src/db');
const { DB } = require('../src/config');

async function main() {
  console.log(`Подключаюсь к ${DB.user}@${DB.host}:${DB.port}/${DB.database} (ssl: ${DB.ssl})...`);

  const [rows] = await pool.query('SELECT 1 AS ok');
  if (rows[0]?.ok !== 1) {
    throw new Error('Неожиданный ответ от MySQL');
  }

  console.log('Подключение к базе данных успешно.');
}

main()
  .catch((err) => {
    console.error('Не удалось подключиться к базе данных:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
