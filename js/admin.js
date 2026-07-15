// شاشة إدارة المواد النظامية + تصدير/استيراد.

import { escapeHtml, showToast } from './ui.js';
import { saveCustomArticles, saveDeletedArticleIds, resetCustomArticles, isSafeUrl } from './data.js';

let state = null;

export function initAdmin(dataState, onChange) {
    state = { ...dataState, onChange };
    renderAdminList();
    bindAdminEvents();
}

export function setAdminState(dataState) {
    if (!state) return;
    state.baseArticles = dataState.baseArticles;
    state.customArticles = dataState.customArticles;
    state.deletedIds = dataState.deletedIds;
    state.articles = dataState.articles;
    renderAdminList();
}

function getCurrentList() {
    return state.articles.slice().sort((a, b) => a.number.localeCompare(b.number, 'ar'));
}

function renderAdminList() {
    const container = document.getElementById('adminList');
    if (!container) return;

    const list = getCurrentList();
    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>لا توجد مواد</p></div>';
        return;
    }

    container.innerHTML = list.map(a => `
        <div class="admin-list-item" data-id="${escapeHtml(a.id)}">
            <div class="info">
                <div class="item-title">${escapeHtml(a.number)} — ${escapeHtml(a.title)}</div>
                <div class="item-meta">${escapeHtml(a.category)}${a.sourceUrl ? ' · 🔗' : ''}</div>
            </div>
            <div class="actions">
                <button data-action="edit" title="تعديل">✏️</button>
                <button data-action="delete" title="حذف">🗑️</button>
            </div>
        </div>
    `).join('');
}

function findArticle(id) {
    return state.articles.find(a => a.id === id);
}

function upsertCustom(article) {
    const list = state.customArticles.filter(a => a.id !== article.id);
    list.push(article);
    state.customArticles = list;
    const saved = saveCustomArticles(list);

    state.deletedIds = state.deletedIds.filter(id => id !== article.id);
    saveDeletedArticleIds(state.deletedIds);

    rebuildMerged();
    state.onChange(state);
    return saved;
}

function deleteArticle(id) {
    const isBase = state.baseArticles.some(a => a.id === id);

    state.customArticles = state.customArticles.filter(a => a.id !== id);
    let saved = saveCustomArticles(state.customArticles);

    if (isBase && !state.deletedIds.includes(id)) {
        state.deletedIds.push(id);
        saved = saveDeletedArticleIds(state.deletedIds) && saved;
    }

    rebuildMerged();
    state.onChange(state);
    if (!saved) showToast('تعذّر حفظ التغيير: امتلأت مساحة التخزين المحلية');
}

function rebuildMerged() {
    const map = new Map();
    state.baseArticles.forEach(a => map.set(a.id, a));
    state.customArticles.forEach(a => map.set(a.id, a));
    state.deletedIds.forEach(id => map.delete(id));
    state.articles = Array.from(map.values());
}

function clearForm() {
    ['fId', 'fNumber', 'fTitle', 'fCategory', 'fKeywords', 'fSourceUrl', 'fText'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('fId').readOnly = false;
}

function loadForm(article) {
    document.getElementById('fId').value = article.id;
    document.getElementById('fId').readOnly = true;
    document.getElementById('fNumber').value = article.number;
    document.getElementById('fTitle').value = article.title;
    document.getElementById('fCategory').value = article.category;
    document.getElementById('fKeywords').value = (article.keywords || []).join('، ');
    document.getElementById('fSourceUrl').value = article.sourceUrl || '';
    document.getElementById('fText').value = article.text;
}

function readForm() {
    const id = document.getElementById('fId').value.trim();
    const number = document.getElementById('fNumber').value.trim();
    const title = document.getElementById('fTitle').value.trim();
    const category = document.getElementById('fCategory').value.trim();
    const keywords = document.getElementById('fKeywords').value
        .split(/[،,]/).map(s => s.trim()).filter(Boolean);
    const sourceUrl = document.getElementById('fSourceUrl').value.trim();
    const text = document.getElementById('fText').value.trim();
    if (!id || !number || !title || !category || !text) {
        showToast('يرجى تعبئة الحقول الأساسية');
        return null;
    }
    if (sourceUrl && !isSafeUrl(sourceUrl)) {
        showToast('رابط المصدر يجب أن يكون رابط https صالحاً');
        return null;
    }
    return { id, number, title, category, keywords, sourceUrl, text };
}

function bindAdminEvents() {
    const adminList = document.getElementById('adminList');
    if (adminList) {
        adminList.addEventListener('click', (e) => {
            const item = e.target.closest('.admin-list-item');
            if (!item) return;
            const id = item.dataset.id;
            const action = e.target.dataset.action;
            if (action === 'edit') {
                const article = findArticle(id);
                if (article) loadForm(article);
            } else if (action === 'delete') {
                if (confirm('هل أنت متأكد من حذف هذه المادة؟ يمكن استعادتها بالضغط على "إعادة تعيين".')) {
                    deleteArticle(id);
                }
            }
        });
    }

    document.getElementById('adminSave')?.addEventListener('click', () => {
        const article = readForm();
        if (!article) return;
        if (!upsertCustom(article)) {
            showToast('تعذّر الحفظ: امتلأت مساحة التخزين المحلية');
            return;
        }
        clearForm();
        showToast('تم حفظ المادة');
    });

    document.getElementById('adminClear')?.addEventListener('click', clearForm);

    document.getElementById('adminReset')?.addEventListener('click', () => {
        if (!confirm('سيتم إلغاء كل التعديلات المحلية والعودة للمواد الأساسية. هل أنت متأكد؟')) return;
        resetCustomArticles();
        state.customArticles = [];
        state.deletedIds = [];
        rebuildMerged();
        state.onChange(state);
        showToast('تم إعادة التعيين');
    });

    document.getElementById('adminExport')?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state.articles, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `articles-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('تم تصدير المواد');
    });

    document.getElementById('adminImport')?.addEventListener('click', () => {
        document.getElementById('adminImportFile')?.click();
    });

    document.getElementById('adminImportFile')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!confirm('سيستبدل الاستيراد كل المواد المخصصة الحالية ويعيد المواد المحذوفة سابقاً. هل أنت متأكد؟')) {
            e.target.value = '';
            return;
        }
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) throw new Error('not-array');

            const valid = parsed.filter(a => a.id && a.number && a.title && a.text && a.category);
            valid.forEach(a => {
                if (!Array.isArray(a.keywords)) a.keywords = [];
                if (a.sourceUrl && !isSafeUrl(a.sourceUrl)) a.sourceUrl = '';
            });

            if (!saveCustomArticles(valid)) {
                showToast('تعذّر الاستيراد: امتلأت مساحة التخزين المحلية');
                e.target.value = '';
                return;
            }
            state.customArticles = valid;
            state.deletedIds = [];
            saveDeletedArticleIds([]);
            rebuildMerged();
            state.onChange(state);
            showToast(`تم استيراد ${valid.length} مادة`);
        } catch {
            showToast('ملف غير صالح');
        }
        e.target.value = '';
    });
}
