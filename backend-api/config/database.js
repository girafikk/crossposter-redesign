const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '192.168.1.10',
    user: 'a1',                 // ← ваш пользователь
    password: 'Password.1',     // ← ваш пароль
    database: 'crossposter',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10
});

module.exports = pool;
