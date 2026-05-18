// اختصارات لوحة المفاتيح.

const SHORTCUTS = [
    { keys: ['Ctrl', 'Enter'], desc: 'تحليل الرسالة', action: 'analyze' },
    { keys: ['Ctrl', 'Shift', 'I'], desc: 'تحسين الصياغة', action: 'improve' },
    { keys: ['Ctrl', 'S'], desc: 'حفظ الرد', action: 'save' },
    { keys: ['Ctrl', 'Shift', 'C'], desc: 'نسخ الرد النهائي', action: 'copy' },
    { keys: ['Ctrl', 'P'], desc: 'طباعة الرد', action: 'print' },
    { keys: ['Ctrl', '/'], desc: 'عرض الاختصارات', action: 'help' },
    { keys: ['Esc'], desc: 'إغلاق النافذة المنبثقة', action: 'escape' },
];

function matches(event, target) {
    const k = event.key.toLowerCase();
    const wantCtrl = target.includes('Ctrl');
    const wantShift = target.includes('Shift');
    const last = target[target.length - 1].toLowerCase();

    if (wantCtrl && !(event.ctrlKey || event.metaKey)) return false;
    if (!wantCtrl && (event.ctrlKey || event.metaKey)) return false;
    if (wantShift && !event.shiftKey) return false;
    if (!wantShift && event.shiftKey && target.length > 1) return false;

    if (last === 'enter' && k === 'enter') return true;
    if (last === 'esc' && k === 'escape') return true;
    if (last === '/' && k === '/') return true;
    return k === last;
}

export function registerShortcuts(handlers) {
    document.addEventListener('keydown', (event) => {
        for (const shortcut of SHORTCUTS) {
            if (matches(event, shortcut.keys)) {
                const handler = handlers[shortcut.action];
                if (handler) {
                    event.preventDefault();
                    handler();
                }
                return;
            }
        }
    });
}

export function getShortcutsList() {
    return SHORTCUTS;
}
