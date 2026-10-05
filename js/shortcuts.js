// اختصارات لوحة المفاتيح.
//
// المطابقة بـ event.code (الموضع الفيزيائي للمفتاح) لا event.key (الحرف الناتج): مع
// تخطيط لوحة المفاتيح العربي يُنتج المفتاح S حرف «س»، فالمطابقة بالحرف تكسر الاختصار
// عند أغلب مستخدمي الأداة.
//
// Ctrl+Shift+I و Ctrl+Shift+C محجوزان لأدوات المطوّر في Chrome و Edge: المتصفح يلتقطهما
// قبل الصفحة ولا يفيد preventDefault، فاستُبدلا بـ F (تحسين) و L (نسخ).

const SHORTCUTS = [
    { keys: ['Ctrl', 'Enter'], code: 'Enter', ctrl: true, desc: 'تحليل الرسالة', action: 'analyze' },
    {
        keys: ['Ctrl', 'Shift', 'F'],
        code: 'KeyF',
        ctrl: true,
        shift: true,
        desc: 'تحسين الصياغة',
        action: 'improve',
    },
    { keys: ['Ctrl', 'S'], code: 'KeyS', ctrl: true, desc: 'حفظ الرد', action: 'save' },
    {
        keys: ['Ctrl', 'Shift', 'L'],
        code: 'KeyL',
        ctrl: true,
        shift: true,
        desc: 'نسخ الرد النهائي',
        action: 'copy',
    },
    { keys: ['Ctrl', 'P'], code: 'KeyP', ctrl: true, desc: 'طباعة الرد', action: 'print' },
    { keys: ['Ctrl', '/'], code: 'Slash', ctrl: true, desc: 'عرض الاختصارات', action: 'help' },
    { keys: ['Esc'], code: 'Escape', desc: 'إغلاق النافذة المنبثقة', action: 'escape' },
];

// تعريف الاختصار يحدد Ctrl و Shift صراحةً، فلا يطابق Ctrl+S اختصار Ctrl+Shift+S مثلاً.
// Esc وحده يُقبل مع أي معدِّل لأنه مخرج لا فعل.
export function matches(event, shortcut) {
    if (event.code !== shortcut.code) return false;
    if (!shortcut.ctrl && !shortcut.shift) return true;
    const ctrl = Boolean(event.ctrlKey || event.metaKey);
    return ctrl === Boolean(shortcut.ctrl) && Boolean(event.shiftKey) === Boolean(shortcut.shift);
}

export function registerShortcuts(handlers) {
    document.addEventListener('keydown', event => {
        const shortcut = SHORTCUTS.find(s => matches(event, s));
        if (!shortcut) return;
        const handler = handlers[shortcut.action];
        if (handler) {
            event.preventDefault();
            handler();
        }
    });
}

export function getShortcutsList() {
    return SHORTCUTS;
}
