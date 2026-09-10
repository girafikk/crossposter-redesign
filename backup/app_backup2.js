const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./config/database');
const { exec } = require('child_process');
const path = require('path');

// ========== TELEGRAM ==========
const TELEGRAM_SCRIPT = path.join(__dirname, 'python/send_telegram.py');

// ========== VK API ==========
const axios = require('axios');

// VK конфигурация
const VK_APP_ID = '54526754';
const VK_SECURE_KEY = 'zC2z0KXmuKXQa6fyNGiS';
const VK_REDIRECT_URI = 'https://balloonlike-sherita-smeariest.ngrok-free.dev/auth/vk/callback';

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

// Функция извлечения username из ссылки https://t.me/username
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

// Функция отправки в Telegram через Python скрипт
async function sendToTelegram(channelLink, content) {
    const chatId = extractChannelUsername(channelLink);
    
    if (!chatId) {
        return { success: false, error: 'Неверный формат ссылки на канал' };
    }
    
    return new Promise((resolve) => {
        // Экранируем текст для передачи в командную строку
        const escapedText = content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        
        const command = `python3 ${TELEGRAM_SCRIPT} "${chatId}" "${escapedText}"`;
        
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

// ========== ФУНКЦИЯ ОТПРАВКИ В VK ==========
async function sendToVK(accessToken, content) {
    try {
        const response = await axios.post('https://api.vk.com/method/wall.post', null, {
            params: {
                access_token: accessToken,
                message: content,
                v: '5.131'
            }
        });
        
        if (response.data.error) {
            return { 
                success: false, 
                error: response.data.error.error_msg || 'Ошибка VK API' 
            };
        }
        
        const postId = response.data.response.post_id;
        
        return {
            success: true,
            post_id: postId,
            link: `https://vk.com/wall${response.data.response.owner_id}_${postId}`
        };
        
    } catch (error) {
        console.error('VK send error:', error.message);
        return { success: false, error: error.message };
    }
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

// POST /api/connect/telegram - сохраняем ссылку на канал
app.post('/api/connect/telegram', requireAuth, async (req, res) => {
    const { channel_link } = req.body;
    const userId = req.session.userId;
    
    if (!channel_link) {
        return res.status(400).json({ status: 'error', message: 'Ссылка на канал обязательна' });
    }
    
    try {
        // Проверяем, работает ли бот с этим каналом
        const testResult = await sendToTelegram(channel_link, '✅ Бот успешно подключен к вашему каналу!');
        
        if (!testResult.success) {
            return res.status(400).json({
                status: 'error',
                message: 'Бот не может отправить сообщение. Убедитесь, что бот добавлен в администраторы канала.',
                error: testResult.error
            });
        }
        
        // Сохраняем ссылку на канал в БД
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

// ========== VK OAuth ЭНДПОИНТЫ ==========

// GET /auth/vk/login - редирект на страницу авторизации VK
app.get('/auth/vk/login', (req, res) => {
    const vkAuthUrl = `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}&redirect_uri=${VK_REDIRECT_URI}&response_type=code&scope=wall,offline&v=5.131`;
    res.redirect(vkAuthUrl);
});

// GET /auth/vk/callback - получение code, обмен на access_token
app.get('/auth/vk/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.send('Ошибка: не получен код авторизации');
    }
    
    try {
        // Обмениваем code на access_token
        const response = await axios.get('https://oauth.vk.com/access_token', {
            params: {
                client_id: VK_APP_ID,
                client_secret: VK_SECURE_KEY,
                redirect_uri: VK_REDIRECT_URI,
                code: code
            }
        });
        
        const { access_token, user_id, email } = response.data;
        
        // Сохраняем токен в сессии
        req.session.vk_access_token = access_token;
        req.session.vk_user_id = user_id;
        
        // Отправляем пользователю успешное сообщение
        res.send(`
            <html>
            <body>
                <h2>✅ VK успешно подключен!</h2>
                <p>User ID: ${user_id}</p>
                <p>Email: ${email || 'не указан'}</p>
                <p>Токен сохранен. Можете закрыть это окно.</p>
                <script>setTimeout(() => window.close(), 3000);</script>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('VK OAuth error:', error.response?.data || error.message);
        res.send(`<h2>❌ Ошибка подключения VK</h2><p>${error.message}</p>`);
    }
});

// POST /api/connect/vk - сохраняем VK токен из сессии в БД
app.post('/api/connect/vk', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const accessToken = req.session.vk_access_token;
    
    if (!accessToken) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Сначала авторизуйтесь через VK по адресу /auth/vk/login' 
        });
    }
    
    try {
        const [existing] = await db.query('SELECT * FROM VK WHERE user_id = ?', [userId]);
        
        if (existing.length > 0) {
            await db.query('UPDATE VK SET access_token = ?, is_active = 1 WHERE user_id = ?', 
                [accessToken, userId]);
        } else {
            await db.query('INSERT INTO VK (user_id, access_token, is_active) VALUES (?, ?, 1)', 
                [userId, accessToken]);
        }
        
        // Очищаем токен из сессии
        delete req.session.vk_access_token;
        
        res.json({ status: 'success', message: 'VK подключен!' });
    } catch (error) {
        console.error('Save VK token error:', error);
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// GET /api/connect/vk/status - статус подключения VK
app.get('/api/connect/vk/status', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        const [result] = await db.query('SELECT access_token, is_active FROM VK WHERE user_id = ?', [userId]);
        
        if (result.length === 0 || !result[0].is_active) {
            return res.json({ status: 'success', data: { connected: false } });
        }
        
        res.json({ status: 'success', data: { connected: true } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// POST /api/post - создание и отправка поста
app.post('/api/post', requireAuth, async (req, res) => {
    const { content, platforms } = req.body;
    const userId = req.session.userId;
    
    if (!content) {
        return res.status(400).json({ status: 'error', message: 'Текст поста обязателен' });
    }
    
    // Определяем платформы для отправки (по умолчанию только telegram)
    let platformList = [];
    if (platforms && Array.isArray(platforms)) {
        platformList = platforms;
    } else if (platforms === 'all' || !platforms) {
        // Если не указано, отправляем только в telegram для совместимости
        platformList = ['telegram'];
    }
    
    try {
        // Сохраняем пост в БД
        const [result] = await db.query(
            `INSERT INTO Post (user_id, content, telegram_status, vk_status) VALUES (?, ?, 'pending', 'pending')`,
            [userId, content]
        );
        const postId = result.insertId;
        
        const results = {};
        
        // Отправляем в Telegram
        if (platformList.includes('telegram')) {
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
        }
        
        // Отправляем в VK
        if (platformList.includes('vk')) {
            const [vkAuth] = await db.query('SELECT access_token FROM VK WHERE user_id = ? AND is_active = 1', [userId]);
            
            if (vkAuth.length === 0) {
                await db.query('UPDATE Post SET vk_status = ? WHERE post_id = ?', ['error', postId]);
                results.vk = { success: false, error: 'VK не подключен' };
            } else {
                const sendResult = await sendToVK(vkAuth[0].access_token, content);
                if (sendResult.success) {
                    await db.query('UPDATE Post SET vk_status = ?, vk_post_id = ? WHERE post_id = ?', 
                        ['published', sendResult.post_id, postId]);
                    results.vk = { success: true, post_id: sendResult.post_id, link: sendResult.link };
                } else {
                    await db.query('UPDATE Post SET vk_status = ? WHERE post_id = ?', ['error', postId]);
                    results.vk = { success: false, error: sendResult.error };
                }
            }
        }
        
        res.json({ status: 'success', data: { post_id: postId, ...results } });
        
    } catch (error) {
        console.error('Post error:', error);
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// GET /api/history - история постов
app.get('/api/history', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        const [posts] = await db.query(
            `SELECT post_id, content, created_at, telegram_status, tg_post_id FROM Post WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        res.json({ status: 'success', data: posts });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// GET /api/connect/telegram/status - статус подключения Telegram
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

// Запуск
app.listen(PORT, () => {
    console.log(`🚀 API сервер запущен на порту ${PORT}`);
    console.log(`📡 http://localhost:${PORT}`);
});
