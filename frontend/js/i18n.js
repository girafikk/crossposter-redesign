/* ============================================================
   i18n — переключение языка интерфейса
   ============================================================ */

(function () {
  'use strict';

  const SUPPORTED = ['ru', 'en'];
  const DEFAULT = 'ru';
  const STORAGE_KEY = 'crossposter_lang';

  const cache = {};

  function getLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
    return DEFAULT;
  }

  async function loadDict(lang) {
    if (cache[lang]) return cache[lang];
    try {
      const res = await fetch(`locales/${lang}.json?v=${Date.now()}`);
      if (!res.ok) throw new Error(`Failed to load ${lang}.json`);
      const data = await res.json();
      cache[lang] = data;
      return data;
    } catch (e) {
      console.error('[i18n] Не удалось загрузить словарь:', lang, e);
      return null;
    }
  }

  function getByPath(obj, path) {
    return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
  }

  function applyDict(dict) {
    // Обычные тексты
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const value = getByPath(dict, key);
      if (typeof value !== 'string') return;
      el.textContent = value;
    });

    // Плейсхолдеры отдельно
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const value = getByPath(dict, key);
      if (typeof value !== 'string') return;
      el.setAttribute('placeholder', value);
    });
  }

  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.setAttribute('lang', lang);

    const dict = await loadDict(lang);
    if (!dict) return;
    applyDict(dict);

    // Обновляем активный язык в меню (галочка + текст в триггере)
    document.querySelectorAll('[data-lang-option]').forEach(el => {
      el.classList.toggle('is-active', el.getAttribute('data-lang-option') === lang);
    });

    // Обновляем ВСЕ метки языка (auth + dropdown ЛК)
    document.querySelectorAll('[data-lang-label]').forEach(el => {
      el.textContent = dict.account && dict.account.language
        ? dict.account.language
        : (lang === 'ru' ? 'Русский' : 'English');
    });

    document.querySelectorAll('[data-lang-flag]').forEach(el => {
      el.textContent = lang === 'ru' ? '🇷🇺' : '🇺🇸';
    }); 

    // Обновляем статусы Telegram/Discord после смены языка
    if (typeof window.loadTelegramStatus === 'function') {
      window.loadTelegramStatus();
    }
    if (typeof window.loadDiscordStatus === 'function') {
      window.loadDiscordStatus();
    }
  }
  // Карта: русский текст сервера → ключ в словаре
  const SERVER_MAP = {
    'Email и пароль обязательны': 'server.email_password_required',
    'Пользователь уже существует': 'server.user_already_exists',
    'Неверный email или пароль': 'server.invalid_credentials',
    'Ошибка сервера': 'server.server_error',
    'Не авторизован': 'server.not_authorized',
    'Ссылка на канал обязательна': 'server.channel_link_required',
    'Бот не может отправить сообщение. Убедитесь, что бот добавлен в администраторы канала.': 'server.bot_cannot_post',
    'Telegram подключен! Тестовое сообщение отправлено.': 'server.telegram_connected_success',
    'Telegram отключен': 'server.telegram_disconnected',
    'ID канала обязателен': 'server.discord_channel_required',
    'ID канала должен быть числом': 'server.discord_channel_number',
    'Бот не может отправить сообщение. Убедитесь, что бот добавлен на сервер и имеет права на отправку.': 'server.bot_cannot_post_discord',
    'Discord подключен! Тестовое сообщение отправлено.': 'server.discord_connected_success',
    'Discord отключен': 'server.discord_disconnected',
    'Текст поста обязателен': 'server.post_text_required',
    'Регистрация успешна': 'server.registration_success',
    'Заполните все поля': 'server.fill_all_fields',
    'Ошибка соединения': 'server.connection_error',
  };

  // Перевод серверного сообщения (по русскому тексту)
  function tServer(ruText) {
    if (!ruText) return '';
    const key = SERVER_MAP[ruText.trim()];
    if (!key) return ruText;
    return window.i18n.t(key);
  }


  // Публичное API
  window.i18n = {
    setLang,
    getLang,
    tServer,
    t: function (key) {
      const dict = cache[getLang()];
      if (!dict) return key;
      return getByPath(dict, key) || key;
    },
  };

  // Инициализация
  document.addEventListener('DOMContentLoaded', () => {
    setLang(getLang());

    // Клики по пунктам языков
    document.querySelectorAll('[data-lang-option]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const lang = el.getAttribute('data-lang-option');
        setLang(lang);
        // Закрываем dropdown после выбора
        const menu = el.closest('[data-dropdown-menu]');
        if (menu) menu.hidden = true;
      });
    });
  });
})();
