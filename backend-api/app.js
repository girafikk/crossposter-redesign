require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./config/database');
const { exec } = require('child_process');
const path = require('path');

// ========== TELEGRAM ==========
const TELEGRAM_SCRIPT = path.join(__dirname, 'python/send_telegram.py');

// ========== DISCORD ==========
const DISCORD_SCRIPT = path.join(__dirname, 'python/send_discord.py');
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Сессии
app.use(session({
    secret: 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ========== ФУНКЦИИ ==========

// --- TELEGRAM ---
function extractChannelUsername(channelLink) {
    let match = channelLink.match(/t\.me\/([a-zA-Z0-9_]+)/);
    if (match) {
        return '@' + match[1];
    }
    if (channelLink.startsWith('@')) {
        return channelLink;
    }
    return null;
}

async function sendToTelegram(channelLink, content) {
    const chatId = extractChannelUsername(channelLink);
    
    if (!chatId) {
        return { success: false, error: 'Неверный формат ссылки на канал' };
    }
    
    return new Promise((resolve) => {
        const escapedText = content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const command = `python3.8 ${TELEGRAM_SCRIPT} "${chatId}" "${escapedText}"`;
        
        console.log(`📤 Выполняем: ${command.substring(0, 100)}...`);
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Python ошибка:', error.message);
                resolve({ success: false, error: error.message });
                return;
            }
            
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (e) {
                console.error('❌ Парсинг JSON:', e.message);
                resolve({ success: false, error: stdout || stderr || 'Неизвестная ошибка' });
            }
        });
    });
}

// --- DISCORD ---
async function sendToDiscord(channelId, content) {
    return new Promise((resolve) => {
        const escapedText = content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const command = `python3.8 ${DISCORD_SCRIPT} "${channelId}" "${escapedText}" "${DISCORD_BOT_TOKEN}"`;
        
        console.log(`📤 Выполняем Discord: ${command.substring(0, 100)}...`);
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Python ошибка:', error.message);
                resolve({ success: false, error: error.message });
                return;
            }
            
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (e) {
                console.error('❌ Парсинг JSON:', e.message);
                resolve({ success: false, error: stdout || stderr || 'Неизвестная ошибка' });
            }
        });
    });
}

// ========== ЭНДПОИНТЫ ==========

// GET /api/health
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'API работает', timestamp: new Date().toISOString() });
});

// POST /api/register
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ status: 'error', message: 'Email и пароль обязательны' });
    }
    
    try {
        const [existing] = await db.query('SELECT * FROM User WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ status: 'error', message: 'Пользователь уже существует' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO User (email, password, role) VALUES (?, ?, "user")', [email, hashedPassword]);
        
        res.json({ status: 'success', message: 'Регистрация успешна' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ status: 'error', message: 'Email и пароль обязательны' });
    }
    
    try {
        const [users] = await db.query('SELECT * FROM User WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ status: 'error', message: 'Неверный email или пароль' });
        }
        
        const isValid = await bcrypt.compare(password, users[0].password);
        if (!isValid) {
            return res.status(401).json({ status: 'error', message: 'Неверный email или пароль' });
        }
        
        req.session.userId = users[0].user_id;
        res.json({ status: 'success', data: { user_id: users[0].user_id, email: users[0].email } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ status: 'error', message: 'Не авторизован' });
    }
    next();
}

// ========== TELEGRAM ЭНДПОИНТЫ ==========

// POST /api/connect/telegram - сохраняем ссылку на канал
app.post('/api/connect/telegram', requireAuth, async (req, res) => {
    const { channel_link } = req.body;
    const userId = req.session.userId;
    
    if (!channel_link) {
        return res.status(400).json({ status: 'error', message: 'Ссылка на канал обязательна' });
    }
    
    try {
        const testResult = await sendToTelegram(channel_link, '✅ Бот успешно подключен к вашему каналу!');
        
        if (!testResult.success) {
            return res.status(400).json({
                status: 'error',
                message: 'Бот не может отправить сообщение. Убедитесь, что бот добавлен в администраторы канала.',
                error: testResult.error
            });
        }
        
        const [existing] = await db.query('SELECT * FROM Telegram WHERE user_id = ?', [userId]);
        
        if (existing.length > 0) {
            await db.query('UPDATE Telegram SET channel_link = ?, is_active = 1 WHERE user_id = ?', [channel_link, userId]);
        } else {
            await db.query('INSERT INTO Telegram (user_id, channel_link, is_active) VALUES (?, ?, 1)', [userId, channel_link]);
        }
        
        res.json({ status: 'success', message: 'Telegram подключен! Тестовое сообщение отправлено.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// GET /api/connect/telegram/status
app.get('/api/connect/telegram/status', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        const [result] = await db.query('SELECT channel_link, is_active FROM Telegram WHERE user_id = ?', [userId]);
        
        if (result.length === 0 || !result[0].is_active) {
            return res.json({ status: 'success', data: { connected: false } });
        }
        
        res.json({ status: 'success', data: { connected: true, channel_link: result[0].channel_link } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// DELETE /api/connect/telegram
app.delete('/api/connect/telegram', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        await db.query('UPDATE Telegram SET is_active = 0 WHERE user_id = ?', [userId]);
        res.json({ status: 'success', message: 'Telegram отключен' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// ========== DISCORD ЭНДПОИНТЫ ==========

// POST /api/connect/discord - сохраняем ID канала
app.post('/api/connect/discord', requireAuth, async (req, res) => {
    const { channel_id } = req.body;
    const userId = req.session.userId;
    
    if (!channel_id) {
        return res.status(400).json({ status: 'error', message: 'ID канала обязателен' });
    }
    
    // Проверяем, что ID канала - это число
    if (!/^\d+$/.test(channel_id)) {
        return res.status(400).json({ status: 'error', message: 'ID канала должен быть числом' });
    }
    
    try {
        // Проверяем, работает ли бот с этим каналом
        const testResult = await sendToDiscord(channel_id, '✅ Бот успешно подключен к вашему каналу!');
        
        if (!testResult.success) {
            return res.status(400).json({
                status: 'error',
                message: 'Бот не может отправить сообщение. Убедитесь, что бот добавлен на сервер и имеет права на отправку.',
                error: testResult.error
            });
        }
        
        const [existing] = await db.query('SELECT * FROM Discord WHERE user_id = ?', [userId]);
        
        if (existing.length > 0) {
            await db.query('UPDATE Discord SET channel_id = ?, is_active = 1 WHERE user_id = ?', [channel_id, userId]);
        } else {
            await db.query('INSERT INTO Discord (user_id, channel_id, is_active) VALUES (?, ?, 1)', [userId, channel_id]);
        }
        
        res.json({ status: 'success', message: 'Discord подключен! Тестовое сообщение отправлено.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// GET /api/connect/discord/status
app.get('/api/connect/discord/status', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        const [result] = await db.query('SELECT channel_id, is_active FROM Discord WHERE user_id = ?', [userId]);
        
        if (result.length === 0 || !result[0].is_active) {
            return res.json({ status: 'success', data: { connected: false } });
        }
        
        res.json({ status: 'success', data: { connected: true, channel_id: result[0].channel_id } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// DELETE /api/connect/discord
app.delete('/api/connect/discord', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        await db.query('UPDATE Discord SET is_active = 0 WHERE user_id = ?', [userId]);
        res.json({ status: 'success', message: 'Discord отключен' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// ========== POST /api/post ==========

app.post('/api/post', requireAuth, async (req, res) => {
    const { content } = req.body;
    const userId = req.session.userId;
    
    if (!content) {
        return res.status(400).json({ status: 'error', message: 'Текст поста обязателен' });
    }
    
    const results = {};
    
    try {
        // Сохраняем пост в БД
        const [result] = await db.query(
            `INSERT INTO Post (user_id, content, telegram_status, vk_status, discord_status) 
             VALUES (?, ?, 'pending', 'pending', 'pending')`,
            [userId, content]
        );
        const postId = result.insertId;
        
        // === TELEGRAM ===
        const [tgAuth] = await db.query('SELECT channel_link FROM Telegram WHERE user_id = ? AND is_active = 1', [userId]);
        
        if (tgAuth.length === 0) {
            await db.query('UPDATE Post SET telegram_status = ? WHERE post_id = ?', ['error', postId]);
            results.telegram = { success: false, error: 'Telegram не подключен' };
        } else {
            const sendResult = await sendToTelegram(tgAuth[0].channel_link, content);
            
            if (sendResult.success) {
                await db.query('UPDATE Post SET telegram_status = ?, tg_post_id = ? WHERE post_id = ?', 
                    ['published', sendResult.post_id, postId]);
                results.telegram = { success: true, post_id: sendResult.post_id };
            } else {
                await db.query('UPDATE Post SET telegram_status = ? WHERE post_id = ?', ['error', postId]);
                results.telegram = { success: false, error: sendResult.error };
            }
        }
        
        // === DISCORD ===
        const [discordAuth] = await db.query('SELECT channel_id FROM Discord WHERE user_id = ? AND is_active = 1', [userId]);
        
        if (discordAuth.length === 0) {
            await db.query('UPDATE Post SET discord_status = ? WHERE post_id = ?', ['error', postId]);
            results.discord = { success: false, error: 'Discord не подключен' };
        } else {
            const sendResult = await sendToDiscord(discordAuth[0].channel_id, content);
            
            if (sendResult.success) {
                await db.query('UPDATE Post SET discord_status = ?, discord_post_id = ? WHERE post_id = ?', 
                    ['published', sendResult.data.id, postId]);
                results.discord = { success: true, post_id: sendResult.data.id };
            } else {
                await db.query('UPDATE Post SET discord_status = ? WHERE post_id = ?', ['error', postId]);
                results.discord = { success: false, error: sendResult.error };
            }
        }
        
        res.json({ 
            status: 'success', 
            data: { 
                post_id: postId,
                telegram: results.telegram,
                discord: results.discord
            } 
        });
        
    } catch (error) {
        console.error('❌ Post error:', error);
        res.status(500).json({ status: 'error', message: 'Ошибка сервера', error: error.message });
    }
});

// GET /api/history
app.get('/api/history', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        const [posts] = await db.query(
            `SELECT post_id, content, created_at, 
             telegram_status, tg_post_id, 
             discord_status, discord_post_id 
             FROM Post WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        res.json({ status: 'success', data: posts });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// Запуск
app.listen(PORT, () => {
    console.log(`🚀 API сервер запущен на порту ${PORT}`);
    console.log(`📡 http://localhost:${PORT}`);
});
