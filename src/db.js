const mysql = require('mysql2/promise');
const { DB } = require('./config');

// Пул создаётся лениво при первом использовании — подключение к БД
// не требуется для запуска самого бота, пока он не работает с данными.
const pool = mysql.createPool({
  host: DB.host,
  port: DB.port,
  database: DB.database,
  user: DB.user,
  password: DB.password,
  ssl: DB.ssl ? {} : undefined,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
