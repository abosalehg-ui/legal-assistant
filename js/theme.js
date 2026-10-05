// إدارة الوضع الفاتح/الداكن.

import { readString, writeString } from './safe-storage.js';

const KEY = 'theme';

// القراءة عبر safe-storage: هذه الوحدة تُستدعى أول ما يُحمَّل app.js، والوصول المباشر
// إلى localStorage يرمي SecurityError حين يحظر المتصفح تخزين المواقع — فكان التطبيق
// كله يتوقف قبل أن يبدأ بسبب تفضيل لون.
export function getStoredTheme() {
    const stored = readString(KEY, null);
    return stored === 'dark' || stored === 'light' ? stored : null;
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
    // فشل حفظ التفضيل لا يمنع تبديل الوضع في الجلسة الحالية.
    writeString(KEY, next);
    return next;
}

export function initTheme() {
    applyTheme(getPreferredTheme());
}
