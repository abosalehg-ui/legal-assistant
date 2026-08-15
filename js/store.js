// مصدر الحقيقة الوحيد لحالة المواد النظامية.
//
// قبل هذا الملف كانت الحالة مملوكة مرتين (app.js و admin.js) وتتزامن عبر دورة
// onChange → setAdminState يعيد فيها كل طرف إسناد حقول الآخر على نفسها. الآن كل
// مستهلك يشترك عبر subscribe() ولا يملك أحد نسخة ثانية.

import { readArray, writeJson, removeKey } from './safe-storage.js';
import { mergeArticles, withNormalized } from './data.js';

const KEYS = {
    custom: 'customArticles',
    deleted: 'deletedArticles',
};

let baseArticles = [];
let customArticles = [];
let deletedIds = [];
let articles = [];
const listeners = new Set();

function rebuild() {
    articles = withNormalized(mergeArticles(baseArticles, customArticles, deletedIds));
}

function emit() {
    listeners.forEach(fn => fn(articles));
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function init(base) {
    baseArticles = Array.isArray(base) ? base : [];
    customArticles = readArray(KEYS.custom);
    deletedIds = readArray(KEYS.deleted).filter(id => typeof id === 'string');
    rebuild();
    return articles;
}

export function getArticles() {
    return articles;
}

export function isBaseArticle(id) {
    return baseArticles.some(a => a.id === id);
}

export function getCategories() {
    return Array.from(new Set(articles.map(a => a.category)));
}

export function findArticle(id) {
    return articles.find(a => a.id === id);
}

// تعيد false إذا تعذّرت الكتابة (امتلاء المساحة) — الحالة في الذاكرة تتحدث في الحالتين
// حتى لا تتناقض الواجهة مع ما يراه المستخدم بعد إظهار رسالة الفشل.
export function upsertArticle(article) {
    customArticles = customArticles.filter(a => a.id !== article.id).concat(article);
    deletedIds = deletedIds.filter(id => id !== article.id);
    const saved = writeJson(KEYS.custom, customArticles) && writeJson(KEYS.deleted, deletedIds);
    rebuild();
    emit();
    return saved;
}

export function removeArticle(id) {
    customArticles = customArticles.filter(a => a.id !== id);
    let saved = writeJson(KEYS.custom, customArticles);
    if (isBaseArticle(id) && !deletedIds.includes(id)) {
        deletedIds = deletedIds.concat(id);
        saved = writeJson(KEYS.deleted, deletedIds) && saved;
    }
    rebuild();
    emit();
    return saved;
}

// يستبدل كل المواد المخصصة دفعة واحدة (مسار الاستيراد) ويعيد المحذوفات.
export function replaceCustomArticles(list) {
    const saved = writeJson(KEYS.custom, list) && writeJson(KEYS.deleted, []);
    if (!saved) return false;
    customArticles = list;
    deletedIds = [];
    rebuild();
    emit();
    return true;
}

export function resetArticles() {
    removeKey(KEYS.custom);
    removeKey(KEYS.deleted);
    customArticles = [];
    deletedIds = [];
    rebuild();
    emit();
}
