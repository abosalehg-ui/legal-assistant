// غلاف موحّد حول localStorage: لا يرمي استثناءً عند امتلاء المساحة أو فساد القيمة المخزّنة.
// كان هذا المنطق مكرراً في data.js و storage.js قبل توحيده هنا.

export function readJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        const parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
        return fallback;
    }
}

// يضمن مصفوفة دائماً: قيمة مخزّنة تالفة أو من نوع آخر تعيد [] بدل أن تنفجر عند .filter لاحقاً.
export function readArray(key) {
    const value = readJson(key, null);
    return Array.isArray(value) ? value : [];
}

// تعيد false عند فشل الكتابة (مثل QuotaExceededError) بدل رمي استثناء.
export function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function readString(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

export function writeString(key, value) {
    try {
        localStorage.setItem(key, String(value));
        return true;
    } catch {
        return false;
    }
}

export function removeKey(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}
