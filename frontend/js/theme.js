/* ============================================================
   Переключение темы (светлая / тёмная)
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'crossposter_theme';
  const DEFAULT_THEME = 'light';
  const SUPPORTED = ['light', 'dark'];

  function getTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (e) {}
    return DEFAULT_THEME;
  }

  function applyTheme(theme) {
    if (!SUPPORTED.includes(theme)) theme = DEFAULT_THEME;

    // Ставим или снимаем атрибут на <html>
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    // Обновляем иконку в триггере
    document.querySelectorAll('[data-theme-icon]').forEach(el => {
      el.textContent = theme === 'dark' ? '🌙' : '☀️';
    });

    // Обновляем активный пункт (галочка)
    document.querySelectorAll('[data-theme-option]').forEach(el => {
      el.classList.toggle('is-active', el.getAttribute('data-theme-option') === theme);
    });
  }

  function setTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
    applyTheme(theme);
  }

  // Публичное API
  window.theme = {
    get: getTheme,
    set: setTheme,
  };

  // Применяем тему сразу при загрузке (до DOMContentLoaded)
  applyTheme(getTheme());

  // Привязываем клики
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-option]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const theme = el.getAttribute('data-theme-option');
        setTheme(theme);
        const menu = el.closest('[data-dropdown-menu]');
        if (menu) menu.hidden = true;
      });
    });

    // Кнопка темы на странице авторизации
    const authThemeBtn = document.getElementById('authThemeToggle');
    if (authThemeBtn) {
      authThemeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const current = getTheme();
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  });  
})();
