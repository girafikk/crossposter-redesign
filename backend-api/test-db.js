const db = require('./config/database');

async function testConnection() {
    try {
        const [rows] = await db.query('SELECT 1 as test');
        console.log('✅ Подключение к БД успешно!', rows);
        
        const [users] = await db.query('SELECT * FROM User');
        console.log('📋 Пользователи в БД:', users);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Ошибка подключения:', error.message);
        process.exit(1);
    }
}

testConnection();
