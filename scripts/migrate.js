// Простой раннер SQL-миграций: применяет файлы из migrations/ по алфавиту,
// каждый ровно один раз, и фиксирует это в таблице migrations (name, run_on).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { DB } = require('../src/config');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  const connection = await mysql.createConnection({
    host: DB.host,
    port: DB.port,
    database: DB.database,
    user: DB.user,
    password: DB.password,
    ssl: DB.ssl ? {} : undefined,
    multipleStatements: true,
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      run_on DATETIME NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  const [applied] = await connection.query('SELECT name FROM migrations');
  const appliedNames = new Set(applied.map((row) => row.name));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const name = '/' + file.replace(/\.sql$/, '');
    if (appliedNames.has(name)) {
      console.log(`пропуск (уже применена): ${name}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`применяю: ${name}`);
    await connection.query(sql);
    await connection.query('INSERT INTO migrations (name, run_on) VALUES (?, NOW())', [name]);
    console.log(`готово: ${name}`);
  }

  await connection.end();
}

run().catch((err) => {
  console.error('Миграция не удалась:', err);
  process.exit(1);
});
