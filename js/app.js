// نقطة الدخول للتطبيق: ربط البيانات، الواجهة، الأحداث.

import { loadData } from './data.js';
import {
    normalizeArabic,
    extractKeywords,
    detectIntent,
    detectTone,
    extractEntities,
    findRelevantArticles,
} from './analyzer.js';
import {
    suggestResponse,
    improveLanguage,
    copyToClipboard,
    fallbackCopy,
} from './response.js';
import {
    loadSavedResponses,
    addResponse,
    deleteResponse,
    findResponse,
    importResponses,
    computeStats,
} from './storage.js';
import {
    showToast,
    renderAnalysis,
    renderArticles,
    renderTemplates,
    renderCategoryFilter,
    renderSavedResponses,
    renderStats,
    openModal,
    closeModal,
    closeAllModals,
} from './ui.js';
import { initTheme, toggleTheme } from './theme.js';
import { registerShortcuts, getShortcutsList } from './shortcuts.js';
import { initAdmin, setAdminState } from './admin.js';

const app = {
    data: null,
    selectedArticleIds: [],
    savedResponses: [],
    currentFilter: 'all',
    lastAnalysisIntent: null,
    lastEntities: [],
    outputBackup: null,
};

initTheme();

// تسجيل Service Worker لتمكين العمل دون اتصال (يتطلب https أو localhost).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed', err));
    });
}

document.addEventListener('DOMContentLoaded', start);

function showLoadError() {
    const box = document.getElementById('loadErrorCard');
    if (!box) return;
    box.classList.add('show');
    document.getElementById('retryLoadBtn')?.addEventListener('click', () => {
        box.classList.remove('show');
        start();
    }, { once: true });
}

async function start() {
    try {
        app.data = await loadData();
    } catch (err) {
        console.error(err);
        showToast('تعذّر تحميل بيانات التطبيق');
        showLoadError();
        return;
    }
    app.savedResponses = loadSavedResponses();

    renderTemplates(app.data.templates);
    renderCategoryFilter(uniqueCategories());
    renderSavedResponses(app.savedResponses);
    refreshStats();

    bindEvents();
    initAdmin(app.data, (newState) => {
        app.data.baseArticles = newState.baseArticles;
        app.data.customArticles = newState.customArticles;
        app.data.deletedIds = newState.deletedIds;
        app.data.articles = newState.articles;
        setAdminState(newState);
        renderCategoryFilter(uniqueCategories());
        refreshStats();
        if (app.currentFilter !== 'all') {
            // إذا حُذفت الفئة المفلترة نعود إلى «الكل» بدل فلتر يشير لفئة غير موجودة.
            if (!uniqueCategories().includes(app.currentFilter)) {
                filterByCategory('all');
            } else {
                filterByCategory(app.currentFilter);
            }
        }
    });

    registerShortcuts({
        analyze: analyzeMessage,
        improve: handleImprove,
        save: handleSave,
        copy: handleCopy,
        print: handlePrint,
        help: () => openModal('shortcutsModal'),
        escape: closeAllModals,
    });

    renderShortcutsList();
}

function uniqueCategories() {
    return Array.from(new Set(app.data.articles.map(a => a.category)));
}

function refreshStats() {
    const stats = computeStats(app.savedResponses);
    renderStats(stats, app.data.articles.length);
}

// يستبدل الرد النهائي مع حفظ نسخة للتراجع إن كان هناك نص سيُفقد.
function setOutput(newValue) {
    const output = document.getElementById('finalOutput');
    const current = output.value;
    if (current.trim() && current !== newValue) {
        app.outputBackup = current;
        document.getElementById('undoOutputBtn')?.classList.remove('hidden');
    }
    output.value = newValue;
}

function undoOutput() {
    if (app.outputBackup === null) {
        showToast('لا يوجد ما يُتراجع عنه');
        return;
    }
    const output = document.getElementById('finalOutput');
    const current = output.value;
    output.value = app.outputBackup;
    app.outputBackup = current.trim() ? current : null;
    if (app.outputBackup === null) {
        document.getElementById('undoOutputBtn')?.classList.add('hidden');
    }
    showToast('تم التراجع');
}

function bindEvents() {
    document.getElementById('analyzeBtn').addEventListener('click', analyzeMessage);
    document.getElementById('undoOutputBtn')?.addEventListener('click', undoOutput);
    document.getElementById('clearInputBtn').addEventListener('click', clearInput);
    document.getElementById('improveBtn').addEventListener('click', handleImprove);
    document.getElementById('addArticleBtn').addEventListener('click', addSelectedArticleToOutput);
    document.getElementById('copyBtn').addEventListener('click', handleCopy);
    document.getElementById('saveBtn').addEventListener('click', handleSave);
    document.getElementById('printBtn').addEventListener('click', handlePrint);
    document.getElementById('clearOutputBtn').addEventListener('click', clearOutput);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    document.getElementById('openAdminBtn').addEventListener('click', () => openModal('adminModal'));
    document.getElementById('openShortcutsBtn').addEventListener('click', () => openModal('shortcutsModal'));

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
        overlay.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(overlay.id));
        });
    });

    document.getElementById('articleSearch').addEventListener('input', searchArticles);

    document.getElementById('savedSearch').addEventListener('input', (e) => {
        renderSavedResponses(app.savedResponses, e.target.value);
    });

    document.getElementById('categoryFilter').addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (btn) filterByCategory(btn.dataset.category);
    });

    // يشغّل المعالج نفسه بالنقر وبمفتاحي Enter/مسافة (إتاحة الوصول).
    const bindActivate = (containerId, handler) => {
        const container = document.getElementById(containerId);
        container.addEventListener('click', handler);
        container.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            handler(e);
        });
    };

    bindActivate('articlesContainer', (e) => {
        if (e.target.closest('[data-no-toggle]')) return;
        const item = e.target.closest('.article-item');
        if (item) toggleArticleSelection(item.dataset.id);
    });

    bindActivate('templatesGrid', (e) => {
        const card = e.target.closest('.template-card');
        if (card) useTemplate(Number(card.dataset.id));
    });

    document.getElementById('savedList').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        if (btn.dataset.action === 'load') loadSavedResponseToOutput(id);
        else if (btn.dataset.action === 'delete') deleteSavedResponse(id);
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('exportArchiveBtn').addEventListener('click', exportArchive);
    document.getElementById('importArchiveBtn').addEventListener('click', () => {
        document.getElementById('archiveImportFile').click();
    });
    document.getElementById('archiveImportFile').addEventListener('change', importArchive);
}

function exportArchive() {
    if (app.savedResponses.length === 0) {
        showToast('لا توجد ردود للتصدير');
        return;
    }
    const blob = new Blob([JSON.stringify(app.savedResponses, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `responses-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير الأرشيف');
}

async function importArchive(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        const added = importResponses(parsed);
        if (added === -1) throw new Error('not-array');
        if (added === null) {
            showToast('تعذّر الاستيراد: امتلأت مساحة التخزين المحلية');
        } else {
            app.savedResponses = loadSavedResponses();
            renderSavedResponses(app.savedResponses, document.getElementById('savedSearch').value);
            refreshStats();
            showToast(added > 0 ? `تمت إضافة ${added} رد إلى الأرشيف` : 'لا توجد ردود جديدة في الملف');
        }
    } catch {
        showToast('ملف غير صالح');
    }
    e.target.value = '';
}

function analyzeMessage() {
    const message = document.getElementById('beneficiaryMessage').value.trim();
    if (!message) {
        showToast('يرجى إدخال رسالة المستفيد أولاً');
        return;
    }

    const normalizedMsg = normalizeArabic(message);
    const foundKeywords = extractKeywords(normalizedMsg, app.data.synonymsMap);
    const detectedIntents = detectIntent(normalizedMsg, app.data.intentPatterns);
    const tone = detectTone(normalizedMsg, app.data.toneIndicators);
    const entities = extractEntities(message);
    const relevantArticles = findRelevantArticles(app.data.articles, foundKeywords, detectedIntents);

    renderAnalysis({ foundKeywords, detectedIntents, tone, entities });
    renderArticles(relevantArticles, app.selectedArticleIds);

    app.lastAnalysisIntent = detectedIntents[0] || null;
    app.lastEntities = entities;

    const response = suggestResponse(
        message, relevantArticles, detectedIntents, entities,
        app.data.language, app.data.defaultResponse,
    );
    setOutput(response);

    showToast(`تم العثور على ${relevantArticles.length} مادة ذات صلة`);
}

function toggleArticleSelection(id) {
    const idx = app.selectedArticleIds.indexOf(id);
    if (idx > -1) app.selectedArticleIds.splice(idx, 1);
    else app.selectedArticleIds.push(id);
    const element = document.querySelector(`.article-item[data-id="${CSS.escape(id)}"]`);
    if (element) {
        const selected = element.classList.toggle('selected');
        element.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
}

function addSelectedArticleToOutput() {
    if (app.selectedArticleIds.length === 0) {
        showToast('يرجى اختيار مادة أولاً');
        return;
    }
    const output = document.getElementById('finalOutput');
    let currentText = output.value;
    app.selectedArticleIds.forEach(id => {
        const article = app.data.articles.find(a => a.id === id);
        if (article && !currentText.includes(article.number)) {
            currentText += `\n\n📌 ${article.number}:\n"${article.text}"`;
        }
    });
    output.value = currentText;
    showToast('تمت إضافة المواد المختارة');
}

function handleImprove() {
    const input = document.getElementById('userResponse').value.trim();
    if (!input) {
        showToast('يرجى كتابة الرد أولاً');
        return;
    }
    setOutput(improveLanguage(input, app.data.language));
    showToast('تم تحسين الصياغة بنجاح');
}

async function handleCopy() {
    const output = document.getElementById('finalOutput').value;
    if (!output.trim()) {
        showToast('لا يوجد رد للنسخ');
        return;
    }
    try {
        await copyToClipboard(output);
        showToast('تم نسخ الرد بنجاح ✓');
    } catch {
        if (fallbackCopy(document.getElementById('finalOutput'))) {
            showToast('تم نسخ الرد بنجاح ✓');
        } else {
            showToast('تعذّر النسخ، يرجى النسخ يدوياً');
        }
    }
}

function handleSave() {
    const output = document.getElementById('finalOutput').value;
    if (!output.trim()) {
        showToast('لا يوجد رد للحفظ');
        return;
    }
    const category = app.lastAnalysisIntent ? app.lastAnalysisIntent.label : null;
    if (!addResponse(output, category)) {
        showToast('تعذّر الحفظ: امتلأت مساحة التخزين، احذف بعض الردود القديمة');
        return;
    }
    app.savedResponses = loadSavedResponses();
    renderSavedResponses(app.savedResponses, document.getElementById('savedSearch').value);
    refreshStats();
    showToast('تم حفظ الرد بنجاح ✓');
}

function handlePrint() {
    const output = document.getElementById('finalOutput').value.trim();
    if (!output) {
        showToast('لا يوجد رد للطباعة');
        return;
    }
    const today = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('printDate').textContent = today;
    window.print();
}

function clearOutput() {
    document.getElementById('finalOutput').value = '';
    showToast('تم مسح الرد');
}

function clearInput() {
    document.getElementById('beneficiaryMessage').value = '';
    document.getElementById('userResponse').value = '';
    document.getElementById('finalOutput').value = '';
    document.getElementById('analysisBox').classList.remove('show');
    app.selectedArticleIds = [];
    document.querySelectorAll('.article-item').forEach(el => el.classList.remove('selected'));
    showToast('تم مسح البيانات');
}

function loadSavedResponseToOutput(id) {
    const response = findResponse(id);
    if (response) {
        setOutput(response.text);
        showToast('تم تحميل الرد');
    }
}

function deleteSavedResponse(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الرد؟')) return;
    deleteResponse(id);
    app.savedResponses = loadSavedResponses();
    renderSavedResponses(app.savedResponses, document.getElementById('savedSearch').value);
    refreshStats();
    showToast('تم حذف الرد');
}

function filterByCategory(category) {
    app.currentFilter = category;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    const list = category === 'all'
        ? app.data.articles
        : app.data.articles.filter(a => a.category === category);
    renderArticles(list, app.selectedArticleIds);
}

function searchArticles() {
    const query = document.getElementById('articleSearch').value.trim();
    if (!query) {
        filterByCategory(app.currentFilter);
        return;
    }
    const normalizedQuery = normalizeArabic(query);
    const results = app.data.articles.filter(article =>
        normalizeArabic(article.text).includes(normalizedQuery) ||
        normalizeArabic(article.title).includes(normalizedQuery) ||
        normalizeArabic(article.number).includes(normalizedQuery) ||
        article.keywords.some(k => normalizeArabic(k).includes(normalizedQuery)),
    );
    renderArticles(results, app.selectedArticleIds);
}

function useTemplate(id) {
    const template = app.data.templates.find(t => t.id === id);
    if (!template) return;

    // تعبئة رقم الطلب/الدعوى تلقائياً من آخر تحليل. التواريخ تُترك للموظف عمداً:
    // تاريخ الرسالة الواردة ليس بالضرورة التاريخ المقصود في الرد الرسمي.
    let text = template.text;
    const ref = app.lastEntities.find(en => en.type === 'رقم طلب/مذكرة');
    if (ref) {
        text = text.replaceAll('[رقم الطلب]', ref.value).replaceAll('[رقم الدعوى]', ref.value);
    }

    setOutput(text);
    switchTab('write');

    const placeholder = text.match(/\[[^\]]+\]/);
    if (placeholder) {
        const output = document.getElementById('finalOutput');
        output.focus();
        output.setSelectionRange(placeholder.index, placeholder.index + placeholder[0].length);
        showToast('تم تحميل القالب — عبّئ الحقول الموضوعة بين أقواس [ ]');
    } else {
        showToast('تم تحميل القالب (يمكنك تعديله)');
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.getElementById('writeTab').classList.toggle('active', tab === 'write');
    document.getElementById('templatesTab').classList.toggle('active', tab === 'templates');
}

function renderShortcutsList() {
    const container = document.getElementById('shortcutsList');
    if (!container) return;
    container.innerHTML = getShortcutsList().map(s => `
        <div class="shortcut-row">
            <div class="desc">${s.desc}</div>
            <div class="keys">${s.keys.map(k => `<kbd>${k}</kbd>`).join(' + ')}</div>
        </div>
    `).join('');
}
