(function () {
  const storageKey = 'chemistryx-theme';
  const defaultTheme = 'dark';
  const synchronizedFrames = new WeakSet();

  function normalizeTheme(theme) {
    return theme === 'light' ? 'light' : 'dark';
  }

  function getTheme() {
    try {
      return normalizeTheme(window.localStorage.getItem(storageKey) || defaultTheme);
    } catch {
      return normalizeTheme(document.documentElement.dataset.theme || defaultTheme);
    }
  }

  function updateButtons(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      const label = button.querySelector('[data-theme-label]');
      if (label) {
        label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
      }
    });
  }

  function syncFrameTheme(frame, theme) {
    try {
      const frameWindow = frame.contentWindow;
      const frameRoot = frameWindow?.document?.documentElement;
      const frameController = frameWindow?.ChemistryXTheme;
      if (frameController) {
        if (frameController.getTheme() !== theme || frameRoot?.dataset.theme !== theme) {
          frameController.setTheme(theme);
        }
        return;
      }

      if (frameRoot) {
        frameRoot.dataset.theme = theme;
        frameRoot.style.colorScheme = theme;
        if (frameWindow?.CustomEvent) {
          frameWindow.dispatchEvent(new frameWindow.CustomEvent('chemistryx-theme-change', { detail: { theme } }));
        }
      }
    } catch {
      // Cross-origin frames keep their own theme selection.
    }
  }

  function syncEmbeddedFrames(theme) {
    document.querySelectorAll('iframe').forEach((frame) => {
      if (!synchronizedFrames.has(frame)) {
        frame.addEventListener('load', () => syncEmbeddedFrames(getTheme()));
        synchronizedFrames.add(frame);
      }
      syncFrameTheme(frame, theme);
    });
  }

  function applyTheme(theme, notify) {
    const nextTheme = normalizeTheme(theme);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    updateButtons(nextTheme);
    syncEmbeddedFrames(nextTheme);
    if (notify) {
      window.dispatchEvent(new CustomEvent('chemistryx-theme-change', { detail: { theme: nextTheme } }));
    }
  }

  function setTheme(theme) {
    const nextTheme = normalizeTheme(theme);
    try {
      window.localStorage.setItem(storageKey, nextTheme);
    } catch {
      // The active page still follows the selected mode if storage is unavailable.
    }
    applyTheme(nextTheme, true);
  }

  function ensureThemeControl() {
    if (!document.body || document.body.dataset.themeController || document.querySelector('[data-theme-toggle]')) {
      return;
    }
    const button = document.createElement('button');
    button.className = 'chemistryx-theme-toggle';
    button.type = 'button';
    button.dataset.themeToggle = '';
    button.innerHTML = '<svg class="theme-toggle-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18V3Z" fill="currentColor"/></svg><span data-theme-label>Light mode</span>';
    const sidebarMenu = document.querySelector('#sidebar > ul');
    const sidebar = sidebarMenu?.closest('#sidebar');
    if (sidebarMenu && sidebar?.getClientRects().length) {
      button.classList.add('chemistryx-theme-toggle--inline');
      const item = document.createElement('li');
      item.className = 'chemistryx-theme-menu-item';
      item.appendChild(button);
      if (sidebarMenu.firstElementChild) {
        sidebarMenu.firstElementChild.after(item);
      } else {
        sidebarMenu.appendChild(item);
      }
    } else {
      if (sidebarMenu) {
        button.classList.add('chemistryx-theme-toggle--detail');
      }
      document.body.appendChild(button);
    }
    updateButtons(getTheme());
  }

  applyTheme(getTheme(), false);
  window.ChemistryXTheme = {
    getTheme,
    setTheme,
    toggle() {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    }
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('[data-theme-toggle]');
    if (button && !button.hasAttribute('data-theme-managed')) {
      window.ChemistryXTheme.toggle();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) {
      applyTheme(event.newValue || defaultTheme, true);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureThemeControl, { once: true });
  } else {
    ensureThemeControl();
  }
})();