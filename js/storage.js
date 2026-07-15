// إدارة الردود المحفوظة في localStorage.

const KEY = 'savedResponses';

// حد أقصى للأرشيف يمنع النمو غير المحدود وامتلاء مساحة التخزين.
export const MAX_SAVED = 500;

export function loadSavedResponses() {
    try {
        return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch {
        return [];
    }
}

// تعيد false عند فشل الكتابة (مثل امتلاء مساحة التخزين) بدل رمي استثناء.
function persist(list) {
    try {
        localStorage.setItem(KEY, JSON.stringify(list));
        return true;
    } catch {
        return false;
    }
}

// تعيد العنصر المحفوظ، أو null إذا تعذّرت الكتابة.
export function addResponse(text, category = null) {
    const list = loadSavedResponses();
    const item = {
        id: Date.now(),
        text,
        category,
        date: new Date().toLocaleDateString('ar-SA'),
        timestamp: Date.now(),
        preview: text.substring(0, 100),
    };
    list.unshift(item);
    if (list.length > MAX_SAVED) list.length = MAX_SAVED;
    return persist(list) ? item : null;
}

export function deleteResponse(id) {
    const list = loadSavedResponses().filter(r => r.id !== id);
    persist(list);
    return list;
}

export function findResponse(id) {
    return loadSavedResponses().find(r => r.id === id);
}

export function computeStats(savedResponses) {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let today = 0;
    let week = 0;
    const categoryCount = {};

    savedResponses.forEach(r => {
        const ts = r.timestamp || r.id || 0;
        if (ts >= todayStart.getTime()) today++;
        if (now - ts <= 7 * DAY) week++;
        if (r.category) {
            categoryCount[r.category] = (categoryCount[r.category] || 0) + 1;
        }
    });

    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

    return {
        total: savedResponses.length,
        today,
        week,
        topCategory: topCategory ? topCategory[0] : '—',
    };
}
