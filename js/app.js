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
    clearAllResponses,
    computeStats,
    filterSavedResponses,
    setResponseStatus,
    getRetentionDays,
    setRetentionDays,
    takeLastPurgedCount,
} from './storage.js';
import {
    showToast,
    renderAnalysis,
    renderArticles,
    renderTemplates,
    renderCategoryFilter,
    renderSavedResponses,
    syncArchiveCategoryOptions,
    renderStats,
    openModal,
    closeModal,
    closeAllModals,
    downloadJson,
    confirmDialog,
    setBusy,
} from './ui.js';
import { initTheme, toggleTheme } from './theme.js';
import { registerShortcuts, getShortcutsList } from './shortcuts.js';
import { initAdmin, MAX_IMPORT_BYTES } from './admin.js';
import { formatDate } from './format.js';
import * as store from './store.js';

// حارس ضد التضمين في إطار (clickjacking): frame-ancestors لا يمكن ضبطه عبر <meta>،
// و GitHub Pages لا يسمح بترويسات HTTP مخصصة. يُستبدل بالترويسة عند النقل لاستضافة تدعمها.
try {
    if (window.top !== window.self) window.top.location = window.self.location;
} catch {
    // أصل مختلف: قراءة top ممنوعة، والتنقل أعلاه هو المحاولة الوحيدة الممكنة.
}

const app = {
    language: null,
    templates: [],
    intentPatterns: [],
    defaultResponse: '',
    toneIndicators: {},
    synonymsMap: {},
    selectedArticleIds: [],
    savedResponses: [],
    currentFilter: 'all',
    archiveFilters: { query: '', status: 'all', tone: 'all', category: 'all' },
    lastMessage: '',
    lastKeywords: [],
    lastDetectedIntents: [],
    activeIntentIndex: 0,
    lastAnalysisIntent: null,
    lastAnalysisTone: null,
    lastEntities: [],
    // آخر نتائج تحليل مرتّبة بالصلة. تُحفظ حتى لا تضيع عند مسح خانة البحث.
    lastRelevantArticles: null,
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

let eventsBound = false;

async function start() {
    setBusy(true);
    let data;
    try {
        data = await loadData();
    } catch (err) {
        console.error(err);
        setBusy(false);
        showToast('تعذّر تحميل بيانات التطبيق');
        showLoadError();
        return;
    }

    app.language = data.language;
    app.templates = data.templates;
    app.intentPatterns = data.intentPatterns;
    app.defaultResponse = data.defaultResponse;
    app.toneIndicators = data.toneIndicators;
    app.synonymsMap = data.synonymsMap;

    store.init(data.baseArticles);
    app.savedResponses = loadSavedResponses();

    renderTemplates(app.templates);
    renderCategoryFilter(store.getCategories(), app.currentFilter);
    renderFilteredArchive();
    refreshStats();
    syncRetentionSelect();

    if (!eventsBound) {
        bindEvents();
        initAdmin();
        store.subscribe(onArticlesChanged);
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
        eventsBound = true;
    }

    setBusy(false);
    notifyPurged();
}

// حذف تلقائي صامت ليس مقبولاً على عمل الموظف — يُعلَن دائماً.
function notifyPurged() {
    const purged = takeLastPurgedCount();
    if (purged > 0) {
        showToast(`حُذف تلقائياً ${purged} رد تجاوز مدة الاحتفاظ`);
    }
}

function onArticlesChanged() {
    renderCategoryFilter(store.getCategories(), app.currentFilter);
    refreshStats();
    // إذا حُذفت الفئة المفلترة نعود إلى «الكل» بدل فلتر يشير لفئة غير موجودة.
    if (app.currentFilter !== 'all' && !store.getCategories().includes(app.currentFilter)) {
        filterByCategory('all');
    } else if (app.currentFilter !== 'all') {
        filterByCategory(app.currentFilter);
    }
}

function refreshStats() {
    const stats = computeStats(app.savedResponses);
    renderStats(stats, store.getArticles().length);
}

// يعيد عرض الأرشيف وفق التصفية الحالية دون إعادة قراءة التخزين.
function renderFilteredArchive() {
    syncArchiveCategoryOptions(app.savedResponses, app.archiveFilters.category);
    renderSavedResponses(app.savedResponses, filterSavedResponses(app.savedResponses, app.archiveFilters));
}

function refreshSavedList() {
    app.savedResponses = loadSavedResponses();
    renderFilteredArchive();
    refreshStats();
}

// يستبدل الرد النهائي مع حفظ نسخة للتراجع إن كان هناك نص سيُفقد.
// كل مسار يغيّر الرد النهائي يجب أن يمر من هنا — وإلا ضاع النص بلا تراجع.
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

    // تصحيح التصنيف بنقرة: يعيد ترتيب المواد ويولّد الرد على أساس الموضوع المختار.
    document.getElementById('analysisContent')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-intent-index]');
        if (!btn) return;
        const index = Number(btn.dataset.intentIndex);
        if (index === app.activeIntentIndex) return;
        applyIntentSelection(index);
        showToast('أُعيد توليد الرد على الموضوع المختار');
    });

    document.getElementById('savedSearch').addEventListener('input', (e) => {
        app.archiveFilters.query = e.target.value;
        renderFilteredArchive();
    });

    const bindArchiveFilter = (id, key) => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            app.archiveFilters[key] = e.target.value;
            renderFilteredArchive();
        });
    };
    bindArchiveFilter('archiveStatusFilter', 'status');
    bindArchiveFilter('archiveToneFilter', 'tone');
    bindArchiveFilter('archiveCategoryFilter', 'category');

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

    // تغيير حالة المعالجة من القائمة المنسدلة على بطاقة الرد (مستمع مفوَّض).
    document.getElementById('savedList').addEventListener('change', (e) => {
        const select = e.target.closest('select[data-action="status"]');
        if (!select) return;
        const updated = setResponseStatus(Number(select.dataset.id), select.value);
        if (!updated) {
            showToast('تعذّر تحديث الحالة');
            refreshSavedList();
            return;
        }
        refreshSavedList();
        showToast('تم تحديث حالة الرد');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('exportArchiveBtn').addEventListener('click', exportArchive);
    document.getElementById('importArchiveBtn').addEventListener('click', () => {
        document.getElementById('archiveImportFile').click();
    });
    document.getElementById('archiveImportFile').addEventListener('change', importArchive);
    document.getElementById('clearArchiveBtn').addEventListener('click', clearArchive);
    document.getElementById('retentionSelect').addEventListener('change', changeRetention);
}

function syncRetentionSelect() {
    const select = document.getElementById('retentionSelect');
    if (select) select.value = String(getRetentionDays());
}

function changeRetention(e) {
    const days = setRetentionDays(e.target.value);
    syncRetentionSelect();
    refreshSavedList();
    notifyPurged();
    showToast(days ? `مدة الاحتفاظ: ${days} يوماً` : 'تم إلغاء الحذف التلقائي');
}

function exportArchive() {
    if (app.savedResponses.length === 0) {
        showToast('لا توجد ردود للتصدير');
        return;
    }
    downloadJson(app.savedResponses, 'responses');
    showToast('تم تصدير الأرشيف');
}

async function clearArchive() {
    if (app.savedResponses.length === 0) {
        showToast('الأرشيف فارغ أصلاً');
        return;
    }
    const ok = await confirmDialog(
        `سيُحذف ${app.savedResponses.length} رد محفوظ نهائياً ولا يمكن التراجع. صدّر الأرشيف أولاً إن كنت تحتاجه.`,
        { confirmLabel: 'حذف الكل' },
    );
    if (!ok) return;
    if (!clearAllResponses()) {
        showToast('تعذّر مسح الأرشيف');
        return;
    }
    refreshSavedList();
    showToast('تم مسح كل الأرشيف');
}

async function importArchive(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
        showToast('الملف أكبر من ٥ ميجابايت — تعذّر الاستيراد');
        e.target.value = '';
        return;
    }
    try {
        const parsed = JSON.parse(await file.text());
        const added = importResponses(parsed);
        if (added === -1) throw new Error('not-array');
        if (added === null) {
            showToast('تعذّر الاستيراد: امتلأت مساحة التخزين المحلية');
        } else {
            refreshSavedList();
            const purged = takeLastPurgedCount();
            if (purged > 0) {
                showToast(`أُضيف ${added} رد، وحُذف ${purged} تجاوز مدة الاحتفاظ`);
            } else {
                showToast(added > 0 ? `تمت إضافة ${added} رد إلى الأرشيف` : 'لا توجد ردود جديدة في الملف');
            }
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
    app.lastMessage = message;
    app.lastKeywords = extractKeywords(normalizedMsg, app.synonymsMap);
    app.lastDetectedIntents = detectIntent(normalizedMsg, app.intentPatterns);
    app.lastAnalysisTone = detectTone(normalizedMsg, app.toneIndicators);
    app.lastEntities = extractEntities(message);

    app.currentFilter = 'all';
    renderCategoryFilter(store.getCategories(), 'all');

    const count = applyIntentSelection(0);
    showToast(`تم العثور على ${count} مادة ذات صلة`);
}

// يعيد بناء المواد والرد على أساس الموضوع المختار (الأول تلقائياً، أو ما ينقره
// الموظف). النية المختارة تتصدر القائمة الممررة لأن الترجيح والرد يقرآن أولها.
function applyIntentSelection(index) {
    const intents = app.lastDetectedIntents || [];
    const active = Math.min(Math.max(index, 0), Math.max(intents.length - 1, 0));
    const ordered = intents.length ? [intents[active], ...intents.filter((_, i) => i !== active)] : [];

    const relevantArticles = findRelevantArticles(store.getArticles(), app.lastKeywords || [], ordered);

    renderAnalysis({
        foundKeywords: app.lastKeywords || [],
        detectedIntents: intents,
        activeIntentIndex: active,
        tone: app.lastAnalysisTone,
        entities: app.lastEntities || [],
    });
    renderArticles(relevantArticles, app.selectedArticleIds);

    app.activeIntentIndex = active;
    app.lastAnalysisIntent = ordered[0] || null;
    app.lastRelevantArticles = relevantArticles;

    setOutput(suggestResponse(
        app.lastMessage, relevantArticles, ordered, app.lastEntities || [],
        app.language, app.defaultResponse, app.lastAnalysisTone,
    ));
    return relevantArticles.length;
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
    let text = document.getElementById('finalOutput').value;
    app.selectedArticleIds.forEach(id => {
        const article = store.findArticle(id);
        if (article && !text.includes(article.number)) {
            text += `\n\n📌 ${article.number}:\n"${article.text}"`;
        }
    });
    setOutput(text);
    showToast('تمت إضافة المواد المختارة');
}

function handleImprove() {
    const input = document.getElementById('userResponse').value.trim();
    if (!input) {
        showToast('يرجى كتابة الرد أولاً');
        return;
    }
    setOutput(improveLanguage(input, app.language));
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
    const extras = {
        tone: app.lastAnalysisTone ? app.lastAnalysisTone.primary : null,
        urgent: Boolean(app.lastAnalysisTone && app.lastAnalysisTone.urgent),
    };
    if (!addResponse(output, category, extras)) {
        showToast('تعذّر الحفظ: امتلأت مساحة التخزين، احذف بعض الردود القديمة');
        return;
    }
    refreshSavedList();
    showToast('تم حفظ الرد بنجاح ✓');
}

function handlePrint() {
    const output = document.getElementById('finalOutput').value.trim();
    if (!output) {
        showToast('لا يوجد رد للطباعة');
        return;
    }
    document.getElementById('printDate').textContent = formatDate();
    window.print();
}

function clearOutput() {
    setOutput('');
    showToast('تم مسح الرد');
}

function clearInput() {
    document.getElementById('beneficiaryMessage').value = '';
    document.getElementById('userResponse').value = '';
    setOutput('');
    document.getElementById('analysisBox').classList.remove('show');
    app.lastAnalysisTone = null;
    app.selectedArticleIds = [];
    document.querySelectorAll('.article-item').forEach(el => {
        el.classList.remove('selected');
        el.setAttribute('aria-pressed', 'false');
    });
    showToast('تم مسح البيانات');
}

function loadSavedResponseToOutput(id) {
    const response = findResponse(id);
    if (response) {
        setOutput(response.text);
        showToast('تم تحميل الرد');
    }
}

async function deleteSavedResponse(id) {
    const ok = await confirmDialog('هل أنت متأكد من حذف هذا الرد؟', { confirmLabel: 'حذف' });
    if (!ok) return;
    deleteResponse(id);
    refreshSavedList();
    showToast('تم حذف الرد');
}

function filterByCategory(category) {
    app.currentFilter = category;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    const list = category === 'all'
        ? store.getArticles()
        : store.getArticles().filter(a => a.category === category);
    renderArticles(list, app.selectedArticleIds);
}

function searchArticles() {
    const query = document.getElementById('articleSearch').value.trim();
    if (!query) {
        // إفراغ البحث يعيد آخر نتائج تحليل بدل استبدالها بكل المواد بلا ترتيب صلة.
        if (app.currentFilter === 'all' && app.lastRelevantArticles) {
            renderArticles(app.lastRelevantArticles, app.selectedArticleIds);
        } else {
            filterByCategory(app.currentFilter);
        }
        return;
    }
    const normalizedQuery = normalizeArabic(query);
    const results = store.getArticles().filter(article =>
        article._normText.includes(normalizedQuery) ||
        article._normTitle.includes(normalizedQuery) ||
        article._normNumber.includes(normalizedQuery) ||
        article._normKeywords.some(k => k.includes(normalizedQuery)),
    );
    renderArticles(results, app.selectedArticleIds);
}

function useTemplate(id) {
    const template = app.templates.find(t => t.id === id);
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
