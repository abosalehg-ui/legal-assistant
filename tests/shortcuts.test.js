// اختبارات الاختصارات والوضع اللوني: مطابقة بالموضع الفيزيائي، وتخزين محظور لا يُسقط التطبيق.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { matches, getShortcutsList } = await import('../js/shortcuts.js');

const byAction = action => getShortcutsList().find(s => s.action === action);
const key = (code, mods = {}) => ({ code, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

test('المطابقة بـ event.code: Ctrl+S يعمل والتخطيط العربي مفعّل (الحرف الناتج «س»)', () => {
    assert.ok(matches({ ...key('KeyS', { ctrlKey: true }), key: 'س' }, byAction('save')));
    assert.ok(matches(key('KeyS', { metaKey: true }), byAction('save')), 'Cmd على ماك');
});

test('المعدِّلات صارمة: Ctrl+S لا يطابق Ctrl+Shift+S ولا S وحده', () => {
    assert.ok(!matches(key('KeyS', { ctrlKey: true, shiftKey: true }), byAction('save')));
    assert.ok(!matches(key('KeyS'), byAction('save')));
    assert.ok(!matches(key('KeyF', { ctrlKey: true }), byAction('improve')), 'التحسين يحتاج Shift');
});

test('لا اختصار على مفاتيح أدوات المطوّر المحجوزة (Ctrl+Shift+I / C / J)', () => {
    for (const code of ['KeyI', 'KeyC', 'KeyJ']) {
        const event = key(code, { ctrlKey: true, shiftKey: true });
        assert.equal(
            getShortcutsList().find(s => matches(event, s)),
            undefined,
            code,
        );
    }
});

test('Esc يغلق النوافذ مع أي معدِّل', () => {
    assert.ok(matches(key('Escape'), byAction('escape')));
    assert.ok(matches(key('Escape', { shiftKey: true }), byAction('escape')));
});

test('theme: تخزين محظور (SecurityError) لا يمنع تحميل الوضع اللوني ولا تبديله', async () => {
    const throwing = () => {
        throw new Error('SecurityError');
    };
    globalThis.localStorage = { getItem: throwing, setItem: throwing, removeItem: throwing };
    const attrs = {};
    globalThis.document = {
        documentElement: {
            setAttribute: (k, v) => {
                attrs[k] = v;
            },
            getAttribute: k => attrs[k] ?? null,
        },
        getElementById: () => null,
    };
    globalThis.window = {};
    const { initTheme, toggleTheme } = await import('../js/theme.js');
    assert.doesNotThrow(initTheme);
    assert.equal(attrs['data-theme'], 'light');
    assert.equal(toggleTheme(), 'dark');
});
