// إدارة الوضع الفاتح/الداكن.

const KEY = 'theme';

export function getStoredTheme() {
    return localStorage.getItem(KEY);
}

export function getPreferredTheme() {
    const stored = getStoredTheme();
    if (stored) return stored;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
        btn.setAttribute('title', theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن');
    }
}

export function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
        localStorage.setItem(KEY, next);
    } catch {
        // فشل حفظ التفضيل لا يمنع تبديل الوضع في الجلسة الحالية
    }
    return next;
}

export function initTheme() {
    applyTheme(getPreferredTheme());
}
