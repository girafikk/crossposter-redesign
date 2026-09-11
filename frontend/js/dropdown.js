/* ============================================================
   Логика выпадающего меню (ЛК, язык, тема)
   ============================================================ */

(function () {
  'use strict';

  function initDropdown(root) {
    const trigger = root.querySelector('[data-dropdown-trigger]');
    const menu = root.querySelector('[data-dropdown-menu]');
    if (!trigger || !menu) return;

    function open() {
      trigger.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
    }
    function close() {
      trigger.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
      root.querySelectorAll('[data-submenu]').forEach(sm => sm.hidden = true);
    }
    function toggle() {
      if (menu.hidden) open(); else close();
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    document.addEventListener('click', () => close());
    menu.addEventListener('click', (e) => e.stopPropagation());

    // Подменю (язык, тема)
    root.querySelectorAll('[data-submenu-trigger]').forEach(subTrigger => {
      subTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const submenu = subTrigger.parentElement.querySelector('[data-submenu]');
        if (!submenu) return;

        const wasHidden = submenu.hidden;
        root.querySelectorAll('[data-submenu]').forEach(sm => sm.hidden = true);
        submenu.hidden = !wasHidden;
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-dropdown]').forEach(initDropdown);
  });
  /* ============================================================
     Гамбургер — открывает/закрывает сайдбар
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.app__sidebar');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('is-open');
    });
    // Клик вне сайдбара закрывает его
    document.addEventListener('click', (e) => {
      if (!sidebar.classList.contains('is-open')) return;
      if (sidebar.contains(e.target) || toggle.contains(e.target)) return;
      sidebar.classList.remove('is-open');
    });

    // Esc закрывает
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') sidebar.classList.remove('is-open');
    });
  });
})();
