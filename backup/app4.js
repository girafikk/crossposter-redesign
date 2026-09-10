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

// ========== ФУНКЦИЯ ОТПРАВКИ В VK ==========
async function sendToVK(accessToken, content) {
    try {
        console.log(`📤 Отправка в VK: ${content.substring(0, 50)}...`);
        
        const response = await axios.post('https://api.vk.com/method/wall.post', null, {
            params: {
                access_token: accessToken,
                message: content,
                v: '5.131'
            }
        });
        
        console.log(`📥 Ответ VK:`, JSON.stringify(response.data));
        
        if (response.data.error) {
            return { 
                success: false, 
                error: response.data.error.error_msg || 'Ошибка VK API' 
            };
        }
        
        const postId = response.data.response.post_id;
        const ownerId = response.data.response.owner_id;
        
        return {
            success: true,
            post_id: postId,
            link: `https://vk.com/wall${ownerId}_${postId}`
        };
        
    } catch (error) {
        console.error('❌ VK send error:', error.message);
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

// ========== VK ЭНДПОИНТЫ ==========

// GET /api/connect/vk/url - возвращает ссылку для получения токена
app.get('/api/connect/vk/url', requireAuth, (req, res) => {
    const vkTokenUrl = 'https://vkhost.github.io/';
    res.json({ 
        status: 'success', 
        data: { 
            url: vkTokenUrl,
            message: 'Перейдите по ссылке, получите токен и вставьте его в форму' 
        } 
    });
});

// POST /api/connect/vk - сохраняем токен (поддерживает и чистый токен, и полную ссылку)
app.post('/api/connect/vk', requireAuth, async (req, res) => {
    let { access_token } = req.body;
    const userId = req.session.userId;
    
    console.log(`📝 Получен запрос на сохранение VK токена для user_id=${userId}`);
    
    if (!access_token) {
        return res.status(400).json({ status: 'error', message: 'Токен или ссылка обязательны' });
    }
    
    // ✨ НОВОЕ: Если пользователь вставил полную ссылку - извлекаем токен
    if (access_token.includes('access_token=')) {
        // Извлекаем токен из URL: ...access_token=XXXXX&expires_in...
        const match = access_token.match(/access_token=([^&]+)/);
        if (match) {
            access_token = match[1];
            console.log(`🔍 Извлечен токен из ссылки: ${access_token.substring(0, 50)}...`);
        }
    }
    
    // Удаляем возможные хвосты
    access_token = access_token.split('&')[0].split('#')[0].trim();
    
    try {
        // Проверяем токен через VK API
        console.log(`🔍 Проверяем токен...`);
        const testResponse = await axios.get('https://api.vk.com/method/users.get', {
            params: {
                access_token: access_token,
                v: '5.131'
            },
            timeout: 10000
        });
        
        if (testResponse.data.error) {
            console.log(`❌ Ошибка VK API: ${testResponse.data.error.error_msg}`);
            return res.status(400).json({
                status: 'error',
                message: 'Неверный токен. Попробуйте получить новый.',
                error: testResponse.data.error.error_msg
            });
        }
        
        const vkUserData = testResponse.data.response[0];
        const vkUserId = vkUserData.id;
        const vkUserName = `${vkUserData.first_name} ${vkUserData.last_name}`;
        
        console.log(`✅ Токен валидный! Пользователь VK: ${vkUserName} (id: ${vkUserId})`);
        
        // Сохраняем токен в БД
        const [existing] = await db.query('SELECT * FROM VK WHERE user_id = ?', [userId]);
        
        if (existing.length > 0) {
            await db.query('UPDATE VK SET access_token = ?, is_active = 1 WHERE user_id = ?', 
                [access_token, userId]);
        } else {
            await db.query('INSERT INTO VK (user_id, access_token, is_active) VALUES (?, ?, 1)', 
                [userId, access_token]);
        }
        
        res.json({ 
            status: 'success', 
            message: 'VK подключен!', 
            data: { 
                vk_user_id: vkUserId,
                vk_user_name: vkUserName
            } 
        });
        
    } catch (error) {
        console.error('❌ Save VK token error:', error.message);
        res.status(500).json({ 
            status: 'error', 
            message: 'Ошибка сервера при сохранении токена'
        });
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
        
        // Проверяем, жив ли токен
        try {
            const testResponse = await axios.get('https://api.vk.com/method/users.get', {
                params: {
                    access_token: result[0].access_token,
                    v: '5.131'
                }
            });
            
            if (testResponse.data.error) {
                return res.json({ status: 'success', data: { connected: false, error: 'Токен устарел' } });
            }
            
            res.json({ 
                status: 'success', 
                data: { 
                    connected: true,
                    vk_user_id: testResponse.data.response[0].id,
                    vk_user_name: `${testResponse.data.response[0].first_name} ${testResponse.data.response[0].last_name}`
                } 
            });
        } catch {
            res.json({ status: 'success', data: { connected: false, error: 'Токен недействителен' } });
        }
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// DELETE /api/connect/vk - отключение VK
app.delete('/api/connect/vk', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        await db.query('UPDATE VK SET is_active = 0 WHERE user_id = ?', [userId]);
        res.json({ status: 'success', message: 'VK отключен' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Ошибка сервера' });
    }
});

// ========== ОБНОВЛЕННЫЙ БЛОК POST /api/post С ПОДРОБНЫМ ЛОГИРОВАНИЕМ ==========

// POST /api/post - создание и отправка поста
app.post('/api/post', requireAuth, async (req, res) => {
    const { content } = req.body;
    const userId = req.session.userId;
    
    console.log(`📝 Получен запрос на пост: userId=${userId}, content=${content?.substring(0, 50)}`);
    
    if (!content) {
        return res.status(400).json({ status: 'error', message: 'Текст поста обязателен' });
    }
    
    const results = {};
    
    try {
        // Сохраняем пост в БД
        const [result] = await db.query(
            `INSERT INTO Post (user_id, content, telegram_status, vk_status) VALUES (?, ?, 'pending', 'pending')`,
            [userId, content]
        );
        const postId = result.insertId;
        console.log(`✅ Пост сохранен в БД: postId=${postId}`);
        
        // === ОТПРАВКА В TELEGRAM ===
        const [tgAuth] = await db.query('SELECT channel_link FROM Telegram WHERE user_id = ? AND is_active = 1', [userId]);
        console.log(`📱 Telegram auth: ${tgAuth.length > 0 ? 'найдено' : 'не найдено'}`);
        
        if (tgAuth.length === 0) {
            await db.query('UPDATE Post SET telegram_status = ? WHERE post_id = ?', ['error', postId]);
            results.telegram = { success: false, error: 'Telegram не подключен' };
        } else {
            console.log(`📤 Отправка в Telegram: ${tgAuth[0].channel_link}`);
            const sendResult = await sendToTelegram(tgAuth[0].channel_link, content);
            console.log(`📥 Результат Telegram: ${JSON.stringify(sendResult)}`);
            
            if (sendResult.success) {
                await db.query('UPDATE Post SET telegram_status = ?, tg_post_id = ? WHERE post_id = ?', 
                    ['published', sendResult.post_id, postId]);
                results.telegram = { success: true, post_id: sendResult.post_id };
            } else {
                await db.query('UPDATE Post SET telegram_status = ? WHERE post_id = ?', ['error', postId]);
                results.telegram = { success: false, error: sendResult.error };
            }
        }
        
        // === ОТПРАВКА В VK ===
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
        
        res.json({ 
            status: 'success', 
            data: { 
                post_id: postId,
                telegram: results.telegram,
                vk: results.vk
            } 
        });
        
    } catch (error) {
        console.error('❌ Post error:', error);
        res.status(500).json({ status: 'error', message: 'Ошибка сервера', error: error.message });
    }
});

// ========== КОНЕЦ ОБНОВЛЕННОГО БЛОКА ==========

// GET /api/history - история постов
app.get('/api/history', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    
    try {
        const [posts] = await db.query(
            `SELECT post_id, content, created_at, telegram_status, tg_post_id, vk_status, vk_post_id FROM Post WHERE user_id = ? ORDER BY created_at DESC`,
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
