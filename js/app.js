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
};

initTheme();

document.addEventListener('DOMContentLoaded', start);

async function start() {
    try {
        app.data = await loadData();
    } catch (err) {
        console.error(err);
        showToast('تعذّر تحميل بيانات التطبيق');
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
        renderCategoryFilter(uniqueCategories());
        refreshStats();
        if (app.currentFilter !== 'all') {
            filterByCategory(app.currentFilter);
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

function bindEvents() {
    document.getElementById('analyzeBtn').addEventListener('click', analyzeMessage);
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
            if (e.target === overlay) overlay.classList.remove('show');
        });
        overlay.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => overlay.classList.remove('show'));
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

    document.getElementById('articlesContainer').addEventListener('click', (e) => {
        if (e.target.closest('[data-no-toggle]')) return;
        const item = e.target.closest('.article-item');
        if (item) toggleArticleSelection(item.dataset.id);
    });

    document.getElementById('templatesGrid').addEventListener('click', (e) => {
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

    const response = suggestResponse(message, relevantArticles, detectedIntents, entities, app.data.language);
    document.getElementById('finalOutput').value = response;

    showToast(`تم العثور على ${relevantArticles.length} مادة ذات صلة`);
}

function toggleArticleSelection(id) {
    const idx = app.selectedArticleIds.indexOf(id);
    if (idx > -1) app.selectedArticleIds.splice(idx, 1);
    else app.selectedArticleIds.push(id);
    const element = document.querySelector(`.article-item[data-id="${CSS.escape(id)}"]`);
    if (element) element.classList.toggle('selected');
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
    document.getElementById('finalOutput').value = improveLanguage(input, app.data.language);
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
    const category = app.lastAnalysisIntent ? app.lastAnalysisIntent.intent : null;
    addResponse(output, category);
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
        document.getElementById('finalOutput').value = response.text;
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
    document.getElementById('finalOutput').value = template.text;
    switchTab('write');
    showToast('تم تحميل القالب (يمكنك تعديله)');
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
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
