import { LocalStore } from './db.mjs';
import { CloudStore } from './cloud-store.mjs';
import { escapeHtml, findCloze, gradeAnswer, reviewSchedule } from './core/content.mjs';
import { importBookFile } from './core/import-book.mjs';
import { extractEpubCover } from './core/epub.mjs';
import { coverDataUrl } from './core/book-cover.mjs';
import { findCoverResource, verifyCoverVersion } from './core/cover-backfill.mjs';
import { lookupWord, parseDictionary } from './core/dictionary.mjs';
import { createEcdictLookup, definitionSource } from './core/ecdict.mjs';
import { emptyDiscoveryState, GITHUB_DISCOVERY_INTERVAL_MS, latestEpubForSelectedResource, selectLatestEpubs } from './core/github-discovery.mjs';
import { checkIn, DAILY_CHECKIN_COINS, emptyGameState, migrateParkScene, placeToy, purchaseToy, unlockedStickers } from './core/playground.mjs';
import { parkMarkup } from './park-view.mjs';
import { PARK_NPCS } from './core/park-catalog.mjs';
import { createParkGames } from './park-games-ui.mjs';
import { equipWearable, purchaseWearable } from './core/wardrobe.mjs';
import { getWardrobe } from './core/wardrobe-rules.mjs';
import { PARK_SECRETS, getAdventure } from './core/park-adventure-rules.mjs';
import { discoverParkSecret } from './core/park-adventure.mjs';
import { FLOWER_CATALOG, GARDEN_BEDS, getGarden } from './core/park-garden-rules.mjs';
import { plantGardenFlower, waterGardenBed } from './core/park-garden.mjs';

let store = new LocalStore();
const lookupEcdict = createEcdictLookup();
const view = document.querySelector('#view');
const state = {
  route: 'library',
  staticHosting: false,
  books: [],
  vocabulary: [],
  annotations: [],
  dictionary: new Map(),
  game: emptyGameState(),
  parkPanel: null,
  parkSelectedToy: null,
  parkNpc: null,
  parkSecret: null,
  parkGardenBed: 'west-1',
  parkGardenFlower: 'daisy',
  parkGardenBusy: false,
  parkError: '',
  discovery: emptyDiscoveryState(),
  discoveryLoading: false,
  discoverySyncing: false,
  discoveryError: '',
  coversLoading: false,
  coverMessage: '',
  search: '',
  currentBook: null,
  currentChapterId: null,
  fontSize: 20,
  lookup: null,
  selection: null,
  reviewCard: null,
  reviewResult: null,
};
let saveProgressTimer;
let toastTimer;
let pendingAutoImportPromise;
let browserSyncAttemptedAt = 0;
let browserSyncPromise;
let parkScene;
let parkSceneEpoch = 0;
let parkUiRevision = 0;
let wardrobePreview;
let wardrobePreviewEpoch = 0;
const parkUpdates = typeof BroadcastChannel === 'function' ? new BroadcastChannel('koala-park-updates') : null;
const parkGames = createParkGames({
  getGame: () => state.game,
  change: (change) => saveParkChange(change, { render: false }),
  refresh: () => reloadParkState(false),
  notify: (message) => showToast(message),
  onOpen: () => parkScene?.setPaused(true),
  onClose: () => {
    parkScene?.setPaused(false);
    if (state.route === 'playground') renderPlayground();
  },
});

const byId = (id) => document.getElementById(id);
const text = (value) => escapeHtml(value ?? '');
const shortDate = (value) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));

function showToast(message, duration = 3200) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
}

async function refreshData() {
  const [books, vocabulary, annotations, dictionary, savedGame] = await Promise.all([
    store.all('books'), store.all('vocabulary'), store.all('annotations'), store.getDictionary(), store.get('settings', 'koala-game'),
  ]);
  state.books = books.sort((a, b) => b.importedAt - a.importedAt);
  state.vocabulary = vocabulary.sort((a, b) => b.createdAt - a.createdAt);
  state.annotations = annotations.sort((a, b) => b.createdAt - a.createdAt);
  state.dictionary = new Map(dictionary.map((entry) => [entry.word.toLocaleLowerCase(), entry.definition]));
  try {
    // 全新浏览器只展示初始状态，首次操作再保存，避免占用备份恢复的同 ID 记录。
    state.game = savedGame
      ? await store.updateGame((saved) => migrateParkScene(saved || emptyGameState()))
      : migrateParkScene(emptyGameState());
    state.parkError = '';
  } catch (error) {
    state.parkError = error.message || '乐园数据暂时无法保存，请稍后重试。';
  }
}

async function configureStorage() {
  if (document.querySelector('meta[name="koala-hosting"]')?.content === 'github-pages') {
    state.staticHosting = true;
    byId('storageText').textContent = '仅保存在当前浏览器';
    return;
  }
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (response.status === 404) return;
  if (!response.ok) throw new Error('无法读取书房保存方式，请确认服务器状态后刷新。');
  const config = await response.json();
  if (config.storageMode !== 'cloud') return;
  store = new CloudStore({ pollIntervalMs: config.syncIntervalMs });
  byId('storageText').textContent = '私有服务器 · 自动同步';
  store.addEventListener('remotechange', (event) => {
    void refreshData().then(async () => {
      if (state.route === 'playground') await reloadParkState(true);
      else if (state.route !== 'reader') render();
      else if (state.currentBook) {
        const latest = state.books.find((book) => book.id === state.currentBook.id);
        if (latest?.versionHash === state.currentBook.versionHash) {
          state.currentBook = {
            ...latest,
            currentChapterId: state.currentChapterId,
            scrollY: window.scrollY,
          };
        }
      }
      showToast('已从服务器同步其他设备的更新。');
    }).catch((error) => showToast(`服务器同步失败：${error.message}`));
  });
}

function routeTo(route) {
  if (state.route !== route) parkUiRevision++;
  if (state.route === 'reader') saveReaderPosition();
  if (route !== 'review') {
    state.reviewCard = null;
    state.reviewResult = null;
  }
  state.route = route;
  state.discoveryLoading = route === 'resources';
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.route === route));
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (route === 'resources') void loadDiscovery();
}

function bookProgress(book) {
  return Math.max(0, Math.min(100, Number(book.progress || 0)));
}

function renderLibrary() {
  const query = state.search.toLocaleLowerCase();
  const books = state.books.filter((book) => `${book.title} ${book.fileName}`.toLocaleLowerCase().includes(query));
  const dueCount = state.vocabulary.filter((card) => card.dueAt <= Date.now()).length;
  view.innerHTML = `
    <section class="hero-card">
      <div class="hero-copy">
        <p class="eyebrow">你的离线英语阅读空间</p>
        <h1>留一点时间，<br><em>读懂一篇英文。</em></h1>
        <p class="hero-description">导入自己的读物，在原文里查词、做标记，再用句子填空把新词记下来。</p>
        <button class="button button-primary" data-action="import-book">＋ 导入第一本读物</button>
      </div>
      <div class="hero-illustration" aria-hidden="true"><div class="sun"></div><div class="book-shape"><span></span><span></span><span></span></div><div class="koala-face"><i></i><b></b><strong></strong></div><div class="leaf leaf-one"></div><div class="leaf leaf-two"></div></div>
    </section>
    <section class="stat-row" aria-label="学习概览">
      <article class="stat-card"><span class="stat-icon peach">▦</span><div><strong>${state.books.length}</strong><span>本读物</span></div></article>
      <article class="stat-card"><span class="stat-icon lilac">▤</span><div><strong>${state.vocabulary.length}</strong><span>个词条</span></div></article>
      <article class="stat-card"><span class="stat-icon mint">◷</span><div><strong>${dueCount}</strong><span>待复习</span></div></article>
      <button class="stat-card stat-action" data-action="dictionary-import"><span class="stat-icon cream">Aa</span><div><strong>${state.dictionary.size || 'ECDICT'}</strong><span>${state.dictionary.size ? '自定义词典词条' : '已内置英汉词库'}</span></div></button>
    </section>
    <section class="section-heading"><div><p class="eyebrow">我的收藏</p><h2>书架 <span class="heading-count">${books.length}</span></h2></div><div class="heading-actions">${state.books.some((book) => book.format === 'epub' && !coverDataUrl(book)) ? `<button class="button button-quiet" data-action="backfill-covers" ${state.coversLoading ? 'disabled' : ''}>${state.coversLoading ? '正在补充封面…' : '补充真实封面'}</button>` : ''}<button class="button button-quiet" data-action="import-book">＋ 添加读物</button></div></section>
    ${state.coverMessage ? `<p class="cover-status" role="status">${text(state.coverMessage)}</p>` : ''}
    ${books.length ? `<div class="book-grid">${books.map(bookCard).join('')}</div>` : emptyLibrary()}
    ${state.vocabulary.length ? `<section class="gentle-reminder"><span>☀</span><div><strong>今天有 ${dueCount} 个词条待复习</strong><p>每次只复习一小会儿，也算向前走了一步。</p></div><button class="text-button" data-route="review">去复习 <span>→</span></button></section>` : ''}
  `;
}

function emptyLibrary() {
  return `<div class="empty-state library-empty"><div class="empty-art" aria-hidden="true"><span>✦</span><span>⌁</span><span>▱</span></div><h3>书架还空着</h3><p>从本机导入一篇 EPUB、TXT 或 Markdown，开始你的第一段阅读。</p><button class="button button-primary" data-action="import-book">选择一篇读物</button><small>文件只保存在本地浏览器，不会上传。</small></div>`;
}

function bookCard(book) {
  const percent = bookProgress(book);
  const colors = ['cover-sage', 'cover-peach', 'cover-blue', 'cover-lilac'];
  const color = colors[Math.abs((book.title || '').length + (book.title || '').charCodeAt(0)) % colors.length];
  const cover = coverDataUrl(book);
  return `<article class="book-card">
    <button class="book-cover ${color} ${cover ? 'has-real-cover' : ''}" data-action="read" data-id="${text(book.id)}" aria-label="阅读 ${text(book.title)}"><span class="cover-placeholder"><span class="cover-symbol">${text((book.title || 'K').slice(0, 1).toUpperCase())}</span><span class="cover-label">${text(book.format?.toUpperCase())}</span><span class="cover-title">${text(book.title)}</span></span>${cover ? `<img class="real-book-cover" src="${cover}" alt="${text(book.title)} · EPUB 原封面" loading="lazy" decoding="async">` : ''}</button>
    <div class="book-card-info"><button class="book-title" data-action="read" data-id="${text(book.id)}">${text(book.title)}</button><div class="book-meta"><span>${text(book.format?.toUpperCase())}</span><span>版本 ${text(book.versionHash?.slice(0, 8) || '本地')}</span></div><div class="progress-line"><span data-progress="${Math.round(percent / 10) * 10}"></span></div><div class="progress-meta"><span>${percent >= 100 ? '已读完' : `阅读进度 ${Math.round(percent)}%`}</span><span>${book.chapters?.length || 0} 章</span></div></div>
  </article>`;
}

function chapterData(book = state.currentBook) {
  return book?.chapters?.find((chapter) => chapter.id === state.currentChapterId) || book?.chapters?.[0] || null;
}

function renderReader() {
  const book = state.currentBook;
  if (!book) {
    state.route = 'library';
    renderLibrary();
    return;
  }
  const chapter = chapterData(book);
  const chapterIndex = Math.max(0, book.chapters.findIndex((item) => item.id === chapter?.id));
  view.innerHTML = `
    <div class="reader-topline"><button class="back-link" data-route="library"><span>←</span> 返回书架</button><div class="reader-top-actions"><button class="button button-quiet" data-action="dictionary-import">词典管理</button><button class="button button-quiet" data-action="font-smaller" aria-label="缩小字号">A−</button><button class="button button-quiet" data-action="font-larger" aria-label="放大字号">A＋</button></div></div>
    <div class="reader-heading"><div><p class="eyebrow">${text(book.fileName)} · 版本 ${text(book.versionHash?.slice(0, 8))}</p><h1>${text(book.title)}</h1></div><div class="reader-progress-badge"><strong>${Math.round(bookProgress(book))}%</strong><span>阅读进度</span></div></div>
    <div class="reader-controls"><label class="select-wrap"><span>章节</span><select id="chapterSelect" aria-label="切换章节">${book.chapters.map((item, index) => `<option value="${text(item.id)}" ${item.id === chapter?.id ? 'selected' : ''}>${index + 1}. ${text(item.title)}</option>`).join('')}</select></label><span class="chapter-counter">${chapterIndex + 1} / ${book.chapters.length}</span><span class="reader-hint">点击单词查词 · 选中原文添加笔记</span></div>
    <div class="reader-paper"><div class="reader-content font-${state.fontSize}" data-book-id="${text(book.id)}" data-chapter-id="${text(chapter?.id)}"></div></div>
    <div class="chapter-nav"><button class="button button-quiet" data-action="previous-chapter" ${chapterIndex <= 0 ? 'disabled' : ''}>← 上一章</button><span>${text(chapter?.title)}</span><button class="button button-quiet" data-action="next-chapter" ${chapterIndex >= book.chapters.length - 1 ? 'disabled' : ''}>下一章 →</button></div>
  `;
  const content = view.querySelector('.reader-content');
  if (!chapter) return;
  chapter.paragraphs.forEach((block, paragraphIndex) => {
    const element = document.createElement(block.kind === 'heading' ? 'h2' : 'p');
    element.className = 'reader-block';
    element.dataset.paragraphIndex = String(paragraphIndex);
    element.id = `reader-paragraph-${paragraphIndex}`;
    appendMarkedText(element, block.text, book, chapter, paragraphIndex);
    content.append(element);
  });
  const saved = book.positions?.[chapter.id] ?? (book.currentChapterId === chapter.id ? book.scrollY : 0);
  requestAnimationFrame(() => {
    window.scrollTo({ top: saved, behavior: 'auto' });
    saveReaderPosition();
  });
}

function appendMarkedText(element, source, book, chapter, paragraphIndex) {
  const marks = state.annotations
    .filter((item) => item.bookId === book.id && item.bookVersion === book.versionHash && item.chapterId === chapter.id && item.paragraphIndex === paragraphIndex)
    .filter((item) => item.startOffset >= 0 && item.endOffset <= source.length && source.slice(item.startOffset, item.endOffset) === item.quote)
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  let cursor = 0;
  for (const annotation of marks) {
    if (annotation.startOffset < cursor) continue;
    element.append(document.createTextNode(source.slice(cursor, annotation.startOffset)));
    const mark = document.createElement('mark');
    mark.className = annotation.note ? 'reader-mark has-note' : 'reader-mark';
    mark.dataset.annotationId = annotation.id;
    mark.textContent = source.slice(annotation.startOffset, annotation.endOffset);
    mark.title = annotation.note || '已标记';
    element.append(mark);
    cursor = annotation.endOffset;
  }
  element.append(document.createTextNode(source.slice(cursor)));
}

function readerTextOffset(paragraph, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  try {
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function rangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const point = document.caretPositionFromPoint?.(x, y);
  if (!point) return null;
  const range = document.createRange();
  range.setStart(point.offsetNode, point.offset);
  range.collapse(true);
  return range;
}

function wordAtPoint(event) {
  const paragraph = event.target.closest('.reader-block');
  if (!paragraph) return null;
  const range = rangeFromPoint(event.clientX, event.clientY);
  if (!range || !paragraph.contains(range.startContainer)) return null;
  const source = paragraph.textContent;
  const offset = readerTextOffset(paragraph, range.startContainer, range.startOffset);
  const words = [...source.matchAll(/[\p{L}\p{N}_'-]+/gu)];
  const match = words.find((item) => item.index <= offset && item.index + item[0].length >= offset);
  if (!match) return null;
  return {
    term: match[0],
    quote: source,
    paragraphIndex: Number(paragraph.dataset.paragraphIndex),
    startOffset: match.index,
    endOffset: match.index + match[0].length,
  };
}

function selectionContext() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return null;
  const range = selection.getRangeAt(0);
  const startParagraph = range.startContainer.parentElement?.closest('.reader-block') || (range.startContainer.closest?.('.reader-block'));
  const endParagraph = range.endContainer.parentElement?.closest('.reader-block') || (range.endContainer.closest?.('.reader-block'));
  if (!startParagraph || startParagraph !== endParagraph) return null;
  const raw = range.toString();
  const quote = raw.trim();
  if (!quote || quote.length > 500) return null;
  const rawStart = readerTextOffset(startParagraph, range.startContainer, range.startOffset);
  const leading = raw.length - raw.trimStart().length;
  return {
    term: quote,
    quote: startParagraph.textContent,
    paragraphIndex: Number(startParagraph.dataset.paragraphIndex),
    startOffset: rawStart + leading,
    endOffset: rawStart + leading + quote.length,
  };
}

async function openLookup(context) {
  if (!context?.term) return;
  const dialog = byId('lookupDialog');
  const result = byId('dictionaryResult');
  const manualLabel = byId('manualDefinitionLabel');
  const manualDefinition = byId('manualDefinition');
  const definition = lookupWord(state.dictionary, context.term);
  const lookup = state.lookup = {
    ...context,
    book: state.currentBook,
    chapter: chapterData(),
    dictionarySource: definition ? '自定义本地词典' : '',
    dictionaryDefinition: definition,
  };
  byId('lookupTerm').textContent = context.term;
  byId('lookupContext').textContent = context.quote;
  result.textContent = definition
    ? `释义（只读）\n${definition}\n\n来源：自定义本地词典`
    : '正在查询本机 ECDICT 英汉词库…';
  manualDefinition.value = '';
  manualDefinition.hidden = true;
  manualLabel.hidden = true;
  byId('saveWord').disabled = !definition;
  if (!dialog.open) dialog.showModal();
  if (definition) return;
  try {
    const entry = await lookupEcdict(context.term);
    if (state.lookup !== lookup || !dialog.open) return;
    if (entry) {
      lookup.dictionarySource = entry.source;
      lookup.dictionaryDefinition = entry.definition;
      result.textContent = `释义（只读）\n${entry.definition}\n\n来源：${entry.source}`;
      byId('saveWord').disabled = false;
    } else {
      result.textContent = '暂未查到释义，请填写你理解的意思。';
      manualDefinition.hidden = false;
      manualLabel.hidden = false;
      byId('saveWord').disabled = !manualDefinition.value.trim();
    }
  } catch {
    if (state.lookup === lookup && dialog.open) {
      result.textContent = '本机 ECDICT 词库暂时无法读取，请手工填写释义。';
      manualDefinition.hidden = false;
      manualLabel.hidden = false;
      byId('saveWord').disabled = !manualDefinition.value.trim();
    }
  }
}

function showSelectionTools(context) {
  view.querySelector('.selection-toolbar')?.remove();
  if (!context) return;
  state.selection = context;
  const selection = window.getSelection();
  const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
  if (!rect) return;
  const toolbar = document.createElement('div');
  toolbar.className = 'selection-toolbar';
  toolbar.innerHTML = '<button data-action="selection-lookup">查词</button><button data-action="selection-annotate">标记 / 笔记</button>';
  toolbar.style.top = `${Math.max(12, rect.top - 48)}px`;
  toolbar.style.left = `${Math.max(12, Math.min(window.innerWidth - 250, rect.left))}px`;
  view.append(toolbar);
}

function renderVocabulary() {
  const query = state.search.toLocaleLowerCase();
  const cards = state.vocabulary.filter((card) => `${card.term} ${card.definitionSnapshot} ${card.sentence} ${card.bookTitle}`.toLocaleLowerCase().includes(query));
  view.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">从原文里收藏的词</p><h1>词汇本</h1><p>每个词条都保留加入时的释义、例句和书籍版本。</p></div><div class="heading-actions"><button class="button button-quiet" data-action="dictionary-import">${state.dictionary.size ? `词典管理 · ${state.dictionary.size} 词` : '导入本地词典'}</button><button class="button button-primary" data-route="review">去复习 <span>→</span></button></div></div>
    ${cards.length ? `<div class="vocabulary-list">${cards.map(vocabularyCard).join('')}</div>` : `<div class="empty-state compact-empty"><div class="empty-icon">Aa</div><h3>${query ? '没有找到匹配词条' : '词汇本还空着'}</h3><p>${query ? '换一个词或释义试试。' : '阅读时点击单词，或选中短语后加入词汇本。'}</p>${!query ? '<button class="button button-quiet" data-action="import-book">先导入一本读物</button>' : ''}</div>`}
    <section class="dictionary-panel"><div><span class="panel-icon">⌕</span><div><strong>本地英汉词典 · ECDICT</strong><p>${state.dictionary.size ? `自定义词典 ${state.dictionary.size} 个词条优先，未命中时查询内置 ECDICT。` : '已内置 ECDICT 免费英汉词库，支持离线查词。也可导入 UTF-8 JSON 或 TSV 作为优先词典。'}</p></div></div><button class="button button-quiet" data-action="dictionary-import">${state.dictionary.size ? '更换自定义词典' : '导入自定义词典'}</button></section>
  `;
}

function vocabularyCard(card) {
  const due = card.dueAt <= Date.now();
  return `<article class="vocab-card"><div class="vocab-main"><div class="vocab-title-row"><h2>${text(card.term)}</h2><span class="due-pill ${due ? 'due-now' : ''}">${due ? '待复习' : `下次 ${shortDate(card.dueAt)}`}</span></div><p class="vocab-definition">${text(card.definitionSnapshot || '尚未填写释义')}</p><blockquote>${text(card.sentence)}</blockquote><div class="source-row">${card.dictionarySource ? `<span>释义：${text(card.dictionarySource)}</span>` : ''}<span>↳ ${text(card.bookTitle)}</span><span>${text(card.chapterTitle || '正文')}</span><span>版本 ${text(card.bookVersion?.slice(0, 8))}</span></div></div><div class="vocab-actions"><button class="icon-text-button" data-action="jump-vocabulary" data-id="${text(card.id)}">回到原文</button><button class="icon-text-button danger-text" data-action="remove-vocabulary" data-id="${text(card.id)}">移除</button></div></article>`;
}

function renderReview() {
  const due = state.vocabulary.filter((card) => card.dueAt <= Date.now() || card.id === state.reviewResult?.cardId);
  const card = state.reviewCard && due.some((item) => item.id === state.reviewCard.id) ? state.reviewCard : due[0];
  state.reviewCard = card || null;
  if (!card) {
    view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">用原句唤回记忆</p><h1>轻松复习</h1><p>从自己保存的例句中抽出一个词，补回空格即可。</p></div></div><div class="empty-state review-empty"><div class="empty-icon">☼</div><h3>${state.vocabulary.length ? '今天的复习完成了' : '先收藏几个词条'}</h3><p>${state.vocabulary.length ? '新的复习时间到了，书房会在这里等你。' : '读到生词时加入词汇本，就能用原句开始练习。'}</p><button class="button button-primary" data-route="${state.vocabulary.length ? 'library' : 'library'}">回到书架</button></div><div class="review-rule"><strong>复习间隔说明</strong><span>答对后 3 天再复习，答错后 1 天再复习。这是简单固定间隔，不是 FSRS。</span></div>`;
    return;
  }
  const cloze = findCloze(card.sentence, card.term);
  if (!cloze) {
    view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">用原句唤回记忆</p><h1>轻松复习</h1></div></div><div class="review-card"><p class="eyebrow">${text(card.bookTitle)}</p><h2>这条原句里找不到「${text(card.term)}」</h2><blockquote>${text(card.sentence)}</blockquote><p class="feedback-text">这条记录可能来自短语或位置变化。你可以回到词汇本移除后重新收藏。</p><button class="button button-primary" data-route="vocabulary">打开词汇本</button></div>`;
    return;
  }
  const answered = state.reviewResult?.cardId === card.id;
  view.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">用原句唤回记忆</p><h1>轻松复习</h1><p>今天还有 ${due.length} 个词条等你。想不起来也没关系，答案会告诉你。</p></div></div>
    <article class="review-card"><div class="review-card-top"><span class="review-index">${due.findIndex((item) => item.id === card.id) + 1} / ${due.length}</span><span class="source-row">${text(card.bookTitle)} · ${text(card.chapterTitle || '正文')}</span></div><p class="eyebrow">填入原文中缺少的单词</p><blockquote class="cloze-sentence">${text(cloze.prompt)}</blockquote><p class="review-definition">${text(card.definitionSnapshot || '想想这个词当时的意思')}</p>
      ${answered ? `<div class="review-feedback ${state.reviewResult.correct ? 'correct' : 'incorrect'}"><strong>${state.reviewResult.correct ? '答对了，做得好。' : `正确答案：${text(cloze.expected)}`}</strong><span>${state.reviewResult.correct ? '这个词将在 3 天后再次出现。' : '我们明天再见一次。'}</span></div><button class="button button-primary full-button" data-action="next-review">下一个词条</button>` : `<label class="sr-only" for="reviewAnswer">你的答案</label><input id="reviewAnswer" class="review-answer" type="text" autocomplete="off" placeholder="输入缺失的单词"><button class="button button-primary full-button" data-action="check-answer">检查答案</button><p class="review-shortcut">按 Enter 检查答案</p>`}
    </article>
    <div class="review-rule"><strong>复习间隔说明</strong><span>忽略大小写并去除首尾空格后精确比对；答对 3 天后复习，答错 1 天后复习。这是简单固定间隔，不是 FSRS。</span></div>
  `;
}

function renderNotes() {
  const query = state.search.toLocaleLowerCase();
  const notes = state.annotations.filter((item) => `${item.quote} ${item.note} ${item.bookTitle} ${item.chapterTitle}`.toLocaleLowerCase().includes(query));
  view.innerHTML = `<div class="page-heading"><div><p class="eyebrow">留在原文里的想法</p><h1>标记与笔记</h1><p>摘录、笔记和位置都保存在本机。书籍版本变化时，会提示无法定位。</p></div></div>
    ${notes.length ? `<div class="notes-list">${notes.map(annotationCard).join('')}</div>` : `<div class="empty-state compact-empty"><div class="empty-icon">✎</div><h3>${query ? '没有找到匹配记录' : '还没有标记或笔记'}</h3><p>${query ? '试试搜索原文、书名或笔记内容。' : '在阅读器里选中一小段原文，添加标记或笔记。'}</p></div>`}`;
}

function annotationCard(item) {
  return `<article class="note-card"><div class="note-card-top"><span class="source-chip">${text(item.bookTitle)}</span><span>${shortDate(item.createdAt)}</span></div><blockquote>${text(item.quote)}</blockquote>${item.note ? `<p class="note-body">${text(item.note)}</p>` : ''}<div class="source-row"><span>${text(item.chapterTitle || '正文')}</span><span>${item.type === 'note' ? '有笔记' : '标记'}</span></div><div class="note-actions"><button class="icon-text-button" data-action="jump-annotation" data-id="${text(item.id)}">回到原文</button><button class="icon-text-button danger-text" data-action="remove-annotation" data-id="${text(item.id)}">移除</button></div></article>`;
}

function dateTimeLabel(value) {
  if (!value) return '尚未同步';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '大小未知';
  if (value < 1024) return `${value} B`;
  let size = value / 1024;
  for (const unit of ['KB', 'MB', 'GB']) {
    if (size < 1024 || unit === 'GB') return `${size.toFixed(size < 10 ? 1 : 0)} ${unit}`;
    size /= 1024;
  }
  return '大小未知';
}

function renderResources() {
  if (state.staticHosting) {
    view.innerHTML = `
      <div class="page-heading discovery-heading"><div><p class="eyebrow">GitHub Pages 静态版</p><h1>外刊资源发现</h1><p>这个免费网页只托管前端文件，不运行 Node 服务；不会自动检查、下载或导入新一期，也不会同步不同浏览器的数据。</p></div></div>
      <section class="discovery-summary"><div class="discovery-status"><span class="status-dot"></span><div><strong>可在本机浏览器使用</strong><span>书籍、词汇、笔记、阅读进度和乐园存档只保存在当前浏览器。</span></div></div><div class="discovery-meta"><a href="https://github.com/hehonghui/awesome-english-ebooks" target="_blank" rel="noopener noreferrer">查看外刊资源目录 ↗</a></div></section>
      <div class="empty-state compact-empty"><div class="empty-icon">↗</div><h3>在线发现与自动导入不可用</h3><p>可从书架导入你有权使用的 EPUB、TXT 或 Markdown 文件；每位朋友需要各自在自己的浏览器导入读物。</p><button class="button button-primary" data-action="import-book">导入本地读物</button></div>
      <p class="privacy-note">此版本不包含已导入书籍，也不提供账号、云端备份或跨设备同步。请使用“导出与备份”在各自设备保存数据。</p>
    `;
    return;
  }
  const discovery = state.discovery;
  const query = state.search.toLocaleLowerCase();
  const resources = (discovery.resources || []).filter((item) => `${item.name} ${item.path} ${item.format}`.toLocaleLowerCase().includes(query));
  const shownResources = resources.slice(0, 100);
  const changes = discovery.changes || { added: [], updated: [], removed: [] };
  const changeCount = changes.added.length + changes.updated.length + changes.removed.length;
  const recentHistory = [...(discovery.history || [])].reverse().slice(0, 12);
  const lastError = discovery.lastError || state.discoveryError;
  const busy = state.discoveryLoading || state.discoverySyncing || discovery.syncing;
  const status = busy ? '正在检查仓库目录' : lastError ? '最近一次检查未成功' : discovery.lastSuccessAt ? '资源目录已更新' : '等待首次检查';
  const events = [
    ...changes.added.map((item) => ({ ...item, changeType: '新增', className: 'added' })),
    ...changes.updated.map((item) => ({ ...item, changeType: '更新', className: 'updated' })),
    ...changes.removed.map((item) => ({ ...item, changeType: '移除', className: 'removed' })),
  ];
  view.innerHTML = `
    <div class="page-heading discovery-heading"><div><p class="eyebrow">手动导入或自动追新刊</p><h1>外刊资源发现</h1><p>点击某一期的按钮时，会自动下载该刊最新 EPUB 并加入书架；书房打开并联网时每 6 小时检查并自动追新刊。PDF、MOBI 暂不支持阅读。</p></div><div class="heading-actions"><button class="button button-primary" data-action="sync-discovery" ${busy ? 'disabled' : ''}>${busy ? '检查中…' : '立即检查更新'}</button></div></div>
    <section class="discovery-summary"><div class="discovery-status"><span class="status-dot ${lastError ? 'status-dot-error' : ''}"></span><div><strong>${status}</strong><span>书房打开并联网时，每 6 小时检查并导入各刊最新 EPUB；也可手动检查。</span></div></div><div class="discovery-meta"><span>最近成功：${text(dateTimeLabel(discovery.lastSuccessAt))}</span><a href="https://github.com/hehonghui/awesome-english-ebooks" target="_blank" rel="noopener noreferrer">hehonghui/awesome-english-ebooks ↗</a></div></section>
    ${lastError ? `<p class="discovery-error" role="status">${text(lastError)}。已有索引仍保留；可以稍后重试。</p>` : ''}
    ${(discovery.autoImportErrors || []).length ? `<p class="discovery-error" role="status">${[...discovery.autoImportErrors].reverse().slice(0, 3).map((item) => `${text(item.path)}：${text(item.message)}`).join('<br>')}</p>` : ''}
    ${changeCount ? `<section class="change-section"><div class="section-heading"><div><p class="eyebrow">最近一次检查</p><h2>发现 ${changeCount} 项变动</h2></div></div><div class="change-list">${events.slice(0, 12).map((item) => `<div class="change-row"><span class="change-tag change-${item.className}">${item.changeType}</span><span>${text(item.path)}</span></div>`).join('')}</div></section>` : ''}
    ${recentHistory.length ? `<details class="discovery-history"><summary>最近的资源变化（${recentHistory.length} 条）</summary><div class="change-list">${recentHistory.map((item) => `<div class="change-row"><span class="change-tag change-${text(item.type)}">${item.type === 'added' ? '新增' : item.type === 'updated' ? '更新' : '移除'}</span><span>${text(item.path)}</span><time>${text(dateTimeLabel(item.detectedAt))}</time></div>`).join('')}</div></details>` : ''}
    <section class="section-heading discovery-list-heading"><div><p class="eyebrow">当前仓库文件目录</p><h2>可发现的读物 <span class="heading-count">${resources.length}</span></h2></div><span class="discovery-branch">分支 ${text(discovery.branch || '等待同步')}</span></section>
    ${shownResources.length ? `<div class="resource-grid">${shownResources.map(resourceCard).join('')}</div>${resources.length > shownResources.length ? `<p class="list-limit-note">匹配到 ${resources.length} 项，当前显示前 100 项；可继续搜索缩小范围。</p>` : ''}` : `<div class="empty-state compact-empty"><div class="empty-icon">↗</div><h3>${state.discoveryLoading ? '正在读取资源索引' : query ? '没有找到匹配资源' : lastError ? '暂时无法读取 GitHub' : '正在等待首次资源发现'}</h3><p>${state.discoveryLoading ? '正在读取 GitHub 文件目录元数据。' : query ? '可以换一本杂志名或文件格式搜索。' : '首次检查完成后，发现的资源会显示在这里。'}</p>${!query && !busy ? '<button class="button button-quiet" data-action="sync-discovery">立即检查</button>' : ''}</div>`}
    <p class="privacy-note">自动下载每个刊物日期最新的 EPUB；新期刊存入本机待导入队列后会加入书架。手动按钮也会获取该刊最新一期。下载文件会校验 GitHub 版本哈希，PDF 和 MOBI 仅提供来源链接。</p>
  `;
}

function resourceCard(item) {
  const latest = item.format === 'EPUB' ? latestEpubForSelectedResource(state.discovery.resources, item) : null;
  const imported = latest && state.books.some((book) => book.externalSource?.sha === latest.sha);
  const action = latest
    ? `<button class="button ${imported ? 'button-quiet' : 'button-primary'}" data-action="import-discovered" data-path="${text(latest.path)}" data-sha="${text(latest.sha)}" ${imported ? 'disabled' : ''}>${imported ? '该刊最新一期已在书架' : '下载最新一期并加入书架'}</button>`
    : '<span class="resource-unsupported">暂不支持阅读</span>';
  const latestNote = latest && latest.sha !== item.sha ? `<p class="resource-latest-note">此卡片是旧期；点击将获取本刊最新一期：${text(latest.name)}</p>` : '';
  return `<article class="resource-card"><div class="resource-card-top"><span class="resource-format">${text(item.format)}</span><span>${text(formatBytes(item.size))}</span></div><h3>${text(item.name)}</h3><p>${text(item.path)}</p>${latestNote}<div class="resource-card-actions"><a href="${text(item.url)}" target="_blank" rel="noopener noreferrer">在 GitHub 查看 ↗</a>${action}</div></article>`;
}

function renderPlayground() {
  if (state.parkError) {
    parkGames.close();
    parkSceneEpoch++;
    parkScene?.dispose();
    parkScene = null;
    closeWardrobePreview();
    view.innerHTML = `<div class="fatal-state"><h1>乐园暂时打不开</h1><p>${text(state.parkError)}</p><p>原有数据已保留。请先导出备份，再刷新重试。</p><button class="button button-quiet" data-action="export">导出与备份</button></div>`;
    return;
  }
  const existingStage = parkScene && view.querySelector('.park-stage-live');
  const existingMirror = wardrobePreview && view.querySelector('.wardrobe-preview');
  view.innerHTML = parkMarkup(state.game, state.parkPanel, state.parkSelectedToy, state.parkNpc, state.parkSecret, { bedId: state.parkGardenBed, flowerId: state.parkGardenFlower, busy: state.parkGardenBusy });
  syncWardrobePreview(existingMirror);
  const stage = view.querySelector('.park-stage-live');
  if (existingStage) {
    stage.replaceWith(existingStage);
    parkScene.update(state.game, state.parkPanel, state.parkSelectedToy);
    parkScene.setPaused(parkGames.isOpen || state.parkPanel === 'wardrobe');
    return;
  }
  const epoch = ++parkSceneEpoch;
  import('./park-scene.mjs').then(({ mountParkScene }) => {
    if (epoch !== parkSceneEpoch || !stage.isConnected) return;
    parkScene = mountParkScene(stage, {
      onShop: () => handleAction({ dataset: { action: 'park-panel', panel: 'shop' } }),
      onToy: (toyId) => handleAction({ dataset: { action: 'park-select', toyId } }).catch((error) => showToast(error.message)),
      onSlot: (slotId) => handleAction({ dataset: { action: 'park-place', slotId } }).catch((error) => showToast(error.message)),
      onNpc: (npcId) => handleAction({ dataset: { action: 'park-npc', npcId } }).catch((error) => showToast(error.message)),
      onSecret: discoverSecret,
      onGardenArrive: careForGarden,
    });
    parkScene.update(state.game, state.parkPanel, state.parkSelectedToy);
    parkScene.setPaused(parkGames.isOpen || state.parkPanel === 'wardrobe');
  }).catch((error) => {
    if (!stage.isConnected) return;
    stage.querySelector('.park-3d-loading').textContent = '三维场景加载失败，请重试。商店与背包仍可使用。';
    stage.classList.add('scene-failed');
    console.error('三维场景加载失败', error);
  });
}

async function discoverSecret(secretId, fromTrail = false, isCurrent = () => true) {
  const secret = PARK_SECRETS.find((item) => item.id === secretId);
  if (!secret) throw new Error('没有找到这个森林彩蛋。');
  const known = getAdventure(state.game).foundIds.includes(secretId);
  const uiRevision = parkUiRevision;
  await saveParkChange((game) => discoverParkSecret(game, secretId), { render: false });
  if (state.route === 'playground' && isCurrent() && uiRevision === parkUiRevision) {
    if (!fromTrail && state.parkPanel === null) {
      state.parkPanel = 'adventure';
      state.parkSecret = secretId;
      renderPlayground();
      focusParkPanel();
    } else if (fromTrail && state.parkPanel === 'adventure') {
      renderPlayground();
    }
  }
  if (!known) showToast(`发现彩蛋「${secret.name}」，已记入探索手账。`);
}

async function careForGarden(bedId, action, isCurrent = () => true) {
  if (!isCurrent() || state.route !== 'playground') return;
  const bed = GARDEN_BEDS.find((item) => item.id === bedId);
  if (!bed) throw new Error('没有找到这片花丛。');
  if (action.kind === 'open') {
    parkUiRevision++;
    state.parkGardenBed = bedId;
    state.parkGardenFlower = getGarden(state.game).beds.find((item) => item.id === bedId)?.flowerId || state.parkGardenFlower;
    state.parkPanel = 'garden';
    renderPlayground();
    focusParkPanel();
    return;
  }
  if (state.parkGardenBusy) throw new Error('正在保存上一次照料，稍等一下。');
  const revision = parkUiRevision;
  const sameView = () => state.route === 'playground' && isCurrent() && revision === parkUiRevision;
  state.parkGardenBusy = true;
  try {
    await saveParkChange((game) => {
      if (!sameView()) return game;
      if (action.kind === 'plant') return plantGardenFlower(game, bedId, action.flowerId);
      if (action.kind !== 'water') throw new Error('这项花园操作暂不可用。');
      const planted = getGarden(game).beds.find((item) => item.id === bedId);
      if (!planted || planted.flowerId !== action.flowerId || planted.plantedAt !== action.plantedAt) throw new Error('这片花丛已经换过花了，请重新选择后浇水。');
      return waterGardenBed(game, bedId);
    }, { render: false });
    if (sameView()) {
      renderPlayground();
      if (action.kind === 'water') parkScene?.waterGarden?.(bedId);
      const flower = FLOWER_CATALOG.find((item) => item.id === action.flowerId);
      showToast(action.kind === 'water' ? `${bed.name}浇好水了，泥土会湿润约 30 分钟。` : `${flower?.name || '花朵'}已经种进${bed.name}，花园已保存。`);
    } else if (state.route === 'playground') {
      parkScene?.update(state.game, state.parkPanel, state.parkSelectedToy);
    }
  } catch (error) {
    if (sameView()) showToast(error.message || '花园暂未保存，请再试一次。', 6000);
    throw error;
  } finally {
    state.parkGardenBusy = false;
    if (state.route === 'playground' && state.parkPanel === 'garden') renderPlayground();
  }
}

function closeWardrobePreview() {
  wardrobePreviewEpoch++;
  wardrobePreview?.dispose();
  wardrobePreview = null;
}

function syncWardrobePreview(existingMirror) {
  const mirror = view.querySelector('.wardrobe-preview');
  if (!mirror) { closeWardrobePreview(); return; }
  if (existingMirror && wardrobePreview) {
    mirror.replaceWith(existingMirror);
    wardrobePreview.update(state.game);
    return;
  }
  const epoch = ++wardrobePreviewEpoch;
  import('./wardrobe-preview.mjs').then(({ mountWardrobePreview }) => {
    if (epoch !== wardrobePreviewEpoch || !mirror.isConnected) return;
    wardrobePreview = mountWardrobePreview(mirror, state.game);
  }).catch((error) => {
    if (mirror.isConnected) mirror.querySelector('.wardrobe-preview-status').textContent = '试衣镜暂时打不开，仍可选择和保存搭配。关闭衣橱再打开可重试。';
    console.error('试衣镜加载失败', error);
  });
}

async function saveParkChange(change, { render: shouldRender = true } = {}) {
  if (state.parkError) throw new Error(state.parkError);
  state.game = await store.updateGame((saved) => change(migrateParkScene(saved || emptyGameState())));
  parkUpdates?.postMessage({ type: 'updated' });
  if (state.route === 'playground' && shouldRender) renderPlayground();
  else view.querySelectorAll('.park-wallet strong').forEach((element) => { element.textContent = state.game.coins; });
  return state.game;
}

async function reloadParkState(shouldRender = true) {
  const saved = await store.get('settings', 'koala-game');
  if (!saved) return;
  const latest = migrateParkScene(saved);
  const changed = latest.updatedAt !== state.game.updatedAt || latest.coins !== state.game.coins
    || latest.activeParkGame?.id !== state.game.activeParkGame?.id
    || latest.activeParkGame?.revision !== state.game.activeParkGame?.revision
    || latest.transactions.length !== state.game.transactions.length
    || JSON.stringify(getWardrobe(latest)) !== JSON.stringify(getWardrobe(state.game))
    || JSON.stringify(getAdventure(latest)) !== JSON.stringify(getAdventure(state.game))
    || JSON.stringify(getGarden(latest)) !== JSON.stringify(getGarden(state.game));
  state.game = latest;
  if (shouldRender && changed && state.route === 'playground') {
    if (parkGames.isOpen) parkGames.sync();
    else renderPlayground();
  }
}

parkUpdates?.addEventListener('message', (event) => {
  if (event.data?.type === 'updated') void reloadParkState().catch((error) => showToast(error.message));
});
window.addEventListener('focus', () => {
  if (state.route === 'playground') void reloadParkState().catch((error) => showToast(error.message));
});

function focusParkPanel() {
  const title = byId('parkPanelTitle');
  title?.focus({ preventScroll: true });
  byId('parkPanel')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}

async function loadDiscovery() {
  if (state.staticHosting) {
    state.discoveryLoading = false;
    state.discoveryError = '';
    if (state.route === 'resources') renderResources();
    return;
  }
  state.discoveryLoading = true;
  state.discoveryError = '';
  if (state.route === 'resources') renderResources();
  try {
    const response = await fetch('/api/discovery');
    const snapshot = await response.json();
    if (!response.ok) throw new Error(snapshot.error || '无法读取资源索引。');
    state.discovery = snapshot;
  } catch (error) {
    state.discoveryError = error.message || '无法读取本机资源索引。';
  } finally {
    state.discoveryLoading = false;
    if (state.route === 'resources') renderResources();
  }
  if (browserCatalogSyncDue()) await syncDiscovery({ silent: true });
  void processPendingAutoImports();
}

const MAX_DISCOVERED_EPUB_BYTES = 150 * 1024 * 1024;
const BROWSER_SYNC_KEY = 'koala-reading.last-github-check';

function browserCatalogSyncDue() {
  let savedAt = 0;
  try { savedAt = Number(localStorage.getItem(BROWSER_SYNC_KEY)) || 0; } catch { /* local in-memory cooldown still applies */ }
  const lastAttempt = Math.max(browserSyncAttemptedAt, savedAt);
  return !lastAttempt || Date.now() - lastAttempt >= GITHUB_DISCOVERY_INTERVAL_MS;
}

function recordBrowserSyncAttempt() {
  browserSyncAttemptedAt = Date.now();
  try { localStorage.setItem(BROWSER_SYNC_KEY, String(browserSyncAttemptedAt)); } catch { /* local in-memory cooldown still applies */ }
}

async function fetchGithubCatalog() {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const repositoryResponse = await fetch('https://api.github.com/repos/hehonghui/awesome-english-ebooks', {
    headers, credentials: 'omit', signal: AbortSignal.timeout(20_000),
  });
  if (!repositoryResponse.ok) throw new Error(`GitHub 仓库请求失败（HTTP ${repositoryResponse.status}）。`);
  const repository = await repositoryResponse.json();
  if (repository?.full_name?.toLocaleLowerCase() !== 'hehonghui/awesome-english-ebooks'
    || typeof repository.default_branch !== 'string' || !repository.default_branch || repository.default_branch.length > 255) {
    throw new Error('GitHub 仓库响应格式无效。');
  }
  const treeResponse = await fetch(`https://api.github.com/repos/hehonghui/awesome-english-ebooks/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`, {
    headers, credentials: 'omit', signal: AbortSignal.timeout(30_000),
  });
  if (!treeResponse.ok) throw new Error(`GitHub 文件目录请求失败（HTTP ${treeResponse.status}）。`);
  const tree = await treeResponse.json();
  if (tree?.truncated === true || !Array.isArray(tree?.tree) || tree.tree.length > 100_000) {
    throw new Error('GitHub 返回的目录不完整，本次索引未替换旧数据。');
  }
  const resources = tree.tree.filter((item) => item?.type === 'blob'
    && typeof item.path === 'string' && /\.(epub|pdf|mobi)$/i.test(item.path))
    .map(({ path, size, sha }) => ({ path, size, sha }));
  const response = await fetch('/api/discovery/catalog', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repository: repository.full_name, branch: repository.default_branch,
      repositoryUpdatedAt: repository.updated_at, etag: treeResponse.headers.get('etag'), resources,
    }),
  });
  const snapshot = await response.json();
  if (!response.ok) throw new Error(snapshot.error || '无法保存 GitHub 资源目录。');
  return snapshot;
}

async function validateGithubBlob(bytes, resource) {
  if (bytes.byteLength > MAX_DISCOVERED_EPUB_BYTES) throw new Error('EPUB 文件超过 150 MB，暂不导入。');
  if (bytes.byteLength !== resource.size) throw new Error('下载文件大小与目录记录不一致，已取消导入。');
  const prefix = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(prefix.length + bytes.byteLength);
  payload.set(prefix);
  payload.set(new Uint8Array(bytes), prefix.length);
  const algorithm = resource.sha.length === 64 ? 'SHA-256' : 'SHA-1';
  const digest = new Uint8Array(await crypto.subtle.digest(algorithm, payload));
  const actualSha = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actualSha !== resource.sha.toLocaleLowerCase()) throw new Error('期刊版本校验失败，已取消导入。');
  return bytes;
}

async function downloadGithubEpubInBrowser(resource, branch) {
  if (!Number.isSafeInteger(resource.size) || resource.size < 0 || resource.size > MAX_DISCOVERED_EPUB_BYTES) {
    throw new Error('EPUB 文件大小无效或超过 150 MB，暂不导入。');
  }
  const encodedPath = resource.path.split('/').map(encodeURIComponent).join('/');
  const url = `https://raw.githubusercontent.com/hehonghui/awesome-english-ebooks/${encodeURIComponent(branch)}/${encodedPath}`;
  const chunkSize = 1024 * 1024;
  const ranges = [];
  for (let start = 0; start < resource.size; start += chunkSize) {
    ranges.push({ start, end: Math.min(start + chunkSize, resource.size) - 1 });
  }
  const chunks = [];
  for (const { start, end } of ranges) {
    const response = await fetch(url, {
      headers: { Accept: 'application/octet-stream', Range: `bytes=${start}-${end}` },
      credentials: 'omit', signal: AbortSignal.timeout(90_000),
    });
    if (response.status !== 206) throw new Error(`GitHub 分段下载失败（HTTP ${response.status}）。`);
    const contentRange = response.headers.get('content-range');
    if (contentRange && contentRange !== `bytes ${start}-${end}/${resource.size}`) {
      throw new Error('GitHub 返回的分段位置与请求不一致。');
    }
    if (response.headers.get('content-type')?.toLocaleLowerCase().includes('text/html')) {
      throw new Error('GitHub 返回的不是 EPUB 文件。');
    }
    const expectedLength = end - start + 1;
    const reader = response.body?.getReader();
    if (!reader) {
      const chunk = new Uint8Array(await response.arrayBuffer());
      if (chunk.byteLength !== expectedLength) throw new Error('下载分段大小与请求不一致，已取消导入。');
      chunks.push(chunk);
      continue;
    }
    const parts = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > expectedLength) {
          await reader.cancel();
          throw new Error('GitHub 返回的分段超过请求大小，已取消导入。');
        }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    if (received !== expectedLength) throw new Error('下载分段大小与请求不一致，已取消导入。');
    const chunk = new Uint8Array(received);
    let position = 0;
    for (const part of parts) { chunk.set(part, position); position += part.byteLength; }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(resource.size);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  if (position !== resource.size) throw new Error('下载文件大小与目录记录不一致，已取消导入。');
  return validateGithubBlob(bytes.buffer, resource);
}

async function downloadDiscoveredEpub(resource, branch) {
  let localError = '';
  try {
    const response = await fetch('/api/discovery/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: resource.path, sha: resource.sha }),
    });
    if (response.ok) return validateGithubBlob(await response.arrayBuffer(), resource);
    const result = await response.json().catch(() => ({}));
    localError = result.error || `本机下载服务返回 HTTP ${response.status}。`;
  } catch (error) {
    localError = error?.message || '本机下载服务无法连接。';
  }
  try { return await downloadGithubEpubInBrowser(resource, branch); }
  catch (error) {
    const message = error?.message || '浏览器直连 GitHub 失败。';
    throw new Error(localError && message === 'Failed to fetch'
      ? `${localError}；浏览器直连 GitHub 也失败了。`
      : message);
  }
}

async function storeDiscoveredEpub(resource, bytes) {
  const fileName = resource.path.split('/').at(-1).replace(/[\\/\u0000-\u001f]/g, '_');
  const file = new File([bytes], fileName, { type: 'application/epub+zip' });
  const book = await importBookFile(file);
  book.externalSource = { repository: 'hehonghui/awesome-english-ebooks', path: resource.path, sha: resource.sha };
  const duplicate = state.books.find((item) => item.versionHash === book.versionHash);
  if (duplicate) {
    await mergeImportedCover(duplicate, book);
  } else {
    await store.put('books', book);
  }
  await refreshData();
  return { book, added: !duplicate };
}

function reflectBookCover(book) {
  const fields = { cover: book.cover, coverCheckedAt: book.coverCheckedAt };
  const current = state.books.find((item) => item.id === book.id);
  if (current) Object.assign(current, fields);
  if (state.currentBook?.id === book.id) Object.assign(state.currentBook, fields);
}

async function mergeImportedCover(existing, imported) {
  return store.updateBook(existing.id, existing.versionHash, (saved) => ({
    ...saved,
    ...(imported.format === 'epub' ? {
      cover: coverDataUrl(saved) ? saved.cover : imported.cover,
      coverCheckedAt: imported.coverCheckedAt,
    } : {}),
    ...(imported.externalSource && !saved.externalSource ? { externalSource: imported.externalSource } : {}),
  }));
}

async function backfillCovers({ retry = false } = {}) {
  if (state.staticHosting) return;
  if (state.coversLoading) return;
  const candidates = state.books.filter((book) => book.format === 'epub' && !coverDataUrl(book) && (retry || !book.coverCheckedAt));
  if (!candidates.length) return;
  state.coversLoading = true;
  const report = (message) => {
    state.coverMessage = message;
    if (state.route === 'library') renderLibrary();
  };
  report('正在查找同一期 EPUB 的内嵌封面…');
  const run = async () => {
    const response = await fetch('/api/discovery');
    if (!response.ok) throw new Error('无法读取期刊来源，请稍后重试。');
    const snapshot = await response.json();
    let added = 0;
    let missing = 0;
    const errors = [];
    for (const [index, book] of candidates.entries()) {
      try {
        const saved = await store.get('books', book.id);
        if (!saved || coverDataUrl(saved)) {
          if (saved) reflectBookCover(saved);
          continue;
        }
        const resource = findCoverResource(saved, snapshot.resources || []);
        if (!resource) {
          errors.push(`《${book.title}》缺少同版本来源，请重新导入原 EPUB`);
          continue;
        }
        report(`正在补充封面 ${index + 1}/${candidates.length} · ${book.title}`);
        const bytes = await downloadDiscoveredEpub(resource, snapshot.branch);
        await verifyCoverVersion(bytes, saved.versionHash);
        const cover = await extractEpubCover(new File([bytes], saved.fileName, { type: 'application/epub+zip' }));
        const updated = await store.updateBook(saved.id, saved.versionHash, (latest) => ({
          ...latest, cover: coverDataUrl(latest) ? latest.cover : cover, coverCheckedAt: Date.now(),
        }));
        reflectBookCover(updated);
        if (coverDataUrl(updated)) added += 1;
        else missing += 1;
      } catch (error) {
        errors.push(`《${book.title}》：${error.message || '封面获取失败'}`);
      }
    }
    const notes = [];
    if (added) notes.push(`已补充 ${added} 本期刊的 EPUB 原封面，已保存在本机。`);
    if (missing) notes.push(`${missing} 本没有可用的内嵌封面，暂用文字封面。`);
    if (errors.length) notes.push(`${errors.length} 本待补充。${errors[0]}${errors.length > 1 ? '；其他期刊可稍后点击补充重试。' : '。'}`);
    report(notes.join(' ') || '书架封面已是最新状态。');
  };
  try {
    if (navigator.locks) {
      await navigator.locks.request('koala-cover-backfill', { ifAvailable: true }, async (lock) => {
        if (lock) await run();
        else report('另一个书房页面正在补充封面，完成后刷新即可查看。');
      });
    } else await run();
  } catch (error) {
    report(`封面暂未补齐：${error.message || '请稍后重试'}。`);
  } finally {
    state.coversLoading = false;
    if (state.route === 'library') renderLibrary();
  }
}

async function completeDiscoveredImport(resource) {
  const response = await fetch('/api/discovery/import-complete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: resource.path, sha: resource.sha }),
  });
  if (response.ok) state.discovery = await response.json();
}

async function syncDiscovery({ silent = false } = {}) {
  if (state.staticHosting) return;
  if (browserSyncPromise) return browserSyncPromise;
  browserSyncPromise = (async () => {
  state.discoverySyncing = true;
  state.discoveryError = '';
  recordBrowserSyncAttempt();
  if (state.route === 'resources') renderResources();
  try {
    let snapshot;
    try { snapshot = await fetchGithubCatalog(); }
    catch (browserError) {
      const response = await fetch('/api/discovery/sync', { method: 'POST' });
      snapshot = await response.json();
      if (!response.ok) throw new Error(snapshot.lastError || browserError.message || 'GitHub 同步失败。');
    }
    state.discovery = snapshot;
    state.discoveryError = '';
    const changes = snapshot.changes || { added: [], updated: [], removed: [] };
    const count = changes.added.length + changes.updated.length + changes.removed.length;
    if (!silent) showToast(count ? `资源检查完成，发现 ${count} 项变化。` : `资源检查完成，当前收录 ${snapshot.resources.length} 项。`);
    void processPendingAutoImports();
  } catch (error) {
    state.discoveryError = error.message || 'GitHub 同步失败。';
    if (!silent) showToast(`资源检查失败：${state.discoveryError}`, 6000);
  } finally {
    state.discoverySyncing = false;
    if (state.route === 'resources') renderResources();
  }
  })();
  try { return await browserSyncPromise; }
  finally { browserSyncPromise = null; }
}

async function importDiscoveredEpub(button) {
  const resource = { path: button.dataset.path, sha: button.dataset.sha };
  button.disabled = true;
  button.textContent = '下载并导入中…';
  try {
    const metadata = state.discovery.resources.find((item) => item.path === resource.path && item.sha === resource.sha);
    if (!metadata) throw new Error('资源列表已更新，请刷新后重试。');
    const bytes = await downloadDiscoveredEpub(metadata, state.discovery.branch);
    const { book, added } = await storeDiscoveredEpub(metadata, bytes);
    await completeDiscoveredImport(metadata).catch(() => {});
    renderResources();
    showToast(added ? `《${book.title}》已加入书架。` : '这期内容已在书架。');
  } catch (error) {
    renderResources();
    showToast(error.message || '下载或导入失败，请稍后重试。', 6000);
  }
}

async function processPendingAutoImports() {
  if (state.staticHosting) return;
  if (pendingAutoImportPromise) return pendingAutoImportPromise;
  pendingAutoImportPromise = (async () => {
    try {
      const response = await fetch('/api/discovery/pending-imports');
      if (!response.ok) return;
      const queue = await response.json();
      const snapshotResponse = await fetch('/api/discovery');
      if (snapshotResponse.ok) state.discovery = await snapshotResponse.json();
      const queued = queue.pending || [];
      const queuedShas = new Set(queued.map((item) => item.sha));
      const importErrors = state.discovery.autoImportErrors || [];
      const latestWithoutQueue = selectLatestEpubs(state.discovery.resources).filter((item) =>
        state.discovery.autoIssueShas[item.publication] !== item.sha
        && !queuedShas.has(item.sha)
        && !importErrors.some((error) => error.source === 'browser' && error.path === item.path && error.sha === item.sha));
      const candidates = [...queued, ...(queue.autoFetching ? [] : latestWithoutQueue)];
      const addedTitles = [];
      const errors = [];
      for (const resource of candidates) {
        try {
          let bytes;
          if (queuedShas.has(resource.sha)) {
            try {
              const download = await fetch(`/api/discovery/pending-imports/${encodeURIComponent(resource.sha)}`);
              if (!download.ok) throw new Error('本机待导入文件暂时不可用。');
              bytes = await validateGithubBlob(await download.arrayBuffer(), resource);
            } catch {
              bytes = await downloadGithubEpubInBrowser(resource, state.discovery.branch);
            }
          } else {
            bytes = await downloadGithubEpubInBrowser(resource, state.discovery.branch);
          }
          const { book, added } = await storeDiscoveredEpub(resource, bytes);
          if (added) addedTitles.push(book.title);
          await completeDiscoveredImport(resource).catch(() => {});
        } catch (error) {
          errors.push(`${resource.path}: ${error.message || '自动导入失败。'}`);
          const endpoint = queuedShas.has(resource.sha)
            ? `/api/discovery/pending-imports/${encodeURIComponent(resource.sha)}/fail`
            : '/api/discovery/import-error';
          await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: resource.path, sha: resource.sha, error: error.message || '自动导入失败。' }),
          }).catch(() => {});
        }
      }
      if (state.route === 'library' && addedTitles.length) renderLibrary();
      if (state.route === 'resources') {
        const latest = await fetch('/api/discovery').then((result) => result.json()).catch(() => null);
        if (latest) state.discovery = latest;
        renderResources();
      }
      if (addedTitles.length) showToast(`最新刊已自动加入书架：${addedTitles.join('、')}`, 5000);
      else if (errors.length) showToast(`自动导入失败：${errors[0]}`, 6000);
    } catch {
      // Pending imports are retried on the next local poll.
    }
  })();
  try { return await pendingAutoImportPromise; }
  finally { pendingAutoImportPromise = null; }
}

async function pollDiscoverySnapshot() {
  if (state.staticHosting) return;
  try {
    const response = await fetch('/api/discovery');
    if (!response.ok) return;
    const snapshot = await response.json();
    if (snapshot.lastSuccessAt !== state.discovery.lastSuccessAt
      || snapshot.lastError !== state.discovery.lastError
      || snapshot.syncing !== state.discovery.syncing) {
      state.discovery = snapshot;
      if (state.route === 'resources') renderResources();
    }
  } catch {
    // The resource page already reports an explicit error on entry or manual sync.
  }
}

function render() {
  if (state.route !== 'playground') {
    closeWardrobePreview();
    parkGames.close();
    parkSceneEpoch++;
    parkScene?.dispose();
    parkScene = null;
  }
  document.querySelector('.app-shell').classList.toggle('park-mode', state.route === 'playground');
  view.classList.toggle('view-playground', state.route === 'playground');
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
  byId('globalSearch').placeholder = state.route === 'resources' ? '搜索杂志或文件名' : '搜索书籍或单词';
  if (state.route === 'reader') renderReader();
  else if (state.route === 'vocabulary') renderVocabulary();
  else if (state.route === 'review') renderReview();
  else if (state.route === 'notes') renderNotes();
  else if (state.route === 'resources') renderResources();
  else if (state.route === 'playground') renderPlayground();
  else renderLibrary();
}

async function saveReaderPosition() {
  const book = state.currentBook;
  if (!book || state.route !== 'reader') return;
  const chapter = chapterData(book);
  if (!chapter) return;
  const content = view.querySelector('.reader-content');
  const scrollY = window.scrollY;
  const readerTop = content ? content.getBoundingClientRect().top + scrollY : scrollY;
  const visibleReaderHeight = scrollY + window.innerHeight - readerTop;
  const readerHeight = Math.max(1, content?.scrollHeight || 1);
  const fraction = Math.max(0, Math.min(1, visibleReaderHeight / readerHeight));
  const chapterIndex = book.chapters.findIndex((item) => item.id === chapter.id);
  const progress = Math.max(0, Math.min(100, ((chapterIndex + fraction) / book.chapters.length) * 100));
  const updated = {
    ...book,
    currentChapterId: chapter.id,
    scrollY,
    progress,
    positions: { ...(book.positions || {}), [chapter.id]: scrollY },
    lastReadAt: Date.now(),
  };
  state.currentBook = updated;
  const index = state.books.findIndex((item) => item.id === updated.id);
  if (index >= 0) state.books[index] = updated;
  try {
    await store.updateBook(book.id, book.versionHash, (saved) => ({
      ...saved,
      currentChapterId: chapter.id, scrollY, progress,
      positions: { ...(saved.positions || {}), [chapter.id]: scrollY },
      lastReadAt: updated.lastReadAt,
    }));
  } catch (error) {
    showToast(`阅读进度保存失败：${error.message}`);
  }
  if (content) {
    const badge = view.querySelector('.reader-progress-badge strong');
    if (badge) badge.textContent = `${Math.round(progress)}%`;
  }
}

async function openBook(id) {
  const book = state.books.find((item) => item.id === id) || await store.get('books', id);
  if (!book) return showToast('找不到这本读物，可能已被移除。');
  state.currentBook = book;
  state.currentChapterId = book.currentChapterId || book.chapters[0]?.id;
  state.route = 'reader';
  render();
}

function currentLocation(context) {
  const book = state.currentBook;
  const chapter = chapterData();
  return {
    bookId: book.id,
    bookTitle: book.title,
    bookVersion: book.versionHash,
    fileName: book.fileName,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    paragraphIndex: context.paragraphIndex,
    startOffset: context.startOffset,
    endOffset: context.endOffset,
    quote: context.quote.slice(context.startOffset, context.endOffset),
  };
}

async function saveVocabulary() {
  const context = state.lookup;
  if (!context?.book || !context?.chapter) return showToast('请在原文中查词后再收藏。');
  const term = context.term.trim();
  const definitionSnapshot = (context.dictionaryDefinition || byId('manualDefinition').value).trim();
  const source = currentLocation(context);
  const duplicate = state.vocabulary.find((card) => card.normalizedTerm === term.toLocaleLowerCase()
    && card.bookId === source.bookId && card.bookVersion === source.bookVersion
    && card.chapterId === source.chapterId && card.paragraphIndex === source.paragraphIndex
    && card.startOffset === context.startOffset && card.endOffset === context.endOffset);
  if (duplicate) {
    byId('lookupDialog').close();
    return showToast('这个词条已经收藏过了。');
  }
  const card = {
    id: crypto.randomUUID(),
    term,
    normalizedTerm: term.toLocaleLowerCase(),
    definitionSnapshot,
    dictionarySource: definitionSource(context, definitionSnapshot),
    sentence: context.quote,
    source,
    bookId: source.bookId,
    bookTitle: source.bookTitle,
    bookVersion: source.bookVersion,
    chapterId: source.chapterId,
    chapterTitle: source.chapterTitle,
    paragraphIndex: source.paragraphIndex,
    startOffset: context.startOffset,
    endOffset: context.endOffset,
    dueAt: Date.now(),
    intervalDays: 0,
    reviewCount: 0,
    createdAt: Date.now(),
  };
  await store.put('vocabulary', card);
  await refreshData();
  byId('lookupDialog').close();
  window.getSelection()?.removeAllRanges();
  showToast('已加入词汇本，原句和位置也保存好了。');
}

function openAnnotationDialog(context) {
  if (!context || !state.currentBook) return showToast('请先选中一段原文。');
  state.selection = context;
  byId('annotationQuote').textContent = context.quote.slice(context.startOffset, context.endOffset);
  byId('annotationNote').value = '';
  byId('annotationDialog').showModal();
}

async function saveAnnotation() {
  const context = state.selection;
  if (!context) return showToast('没有可保存的原文位置。');
  const source = currentLocation(context);
  const note = byId('annotationNote').value.trim();
  const record = {
    id: crypto.randomUUID(),
    type: note ? 'note' : 'mark',
    ...source,
    note,
    createdAt: Date.now(),
  };
  await store.put('annotations', record);
  await refreshData();
  byId('annotationDialog').close();
  renderReader();
  showToast('已保存标记和原文位置。');
}

async function jumpToSource(item, kind) {
  const book = await store.get('books', item.bookId);
  if (!book) return showToast('对应读物已不在书架，记录仍保留，但无法跳回。');
  if (book.versionHash !== item.bookVersion) return showToast('当前读物版本与记录时不同，无法安全定位这段原文。');
  const chapter = book.chapters.find((part) => part.id === item.chapterId);
  const paragraph = chapter?.paragraphs?.[item.paragraphIndex];
  if (!paragraph || paragraph.text.slice(item.startOffset, item.endOffset) !== item.quote) {
    const index = paragraph?.text.indexOf(item.quote) ?? -1;
    if (index < 0) return showToast('原文片段已经无法定位；这条记录仍保留在本地。');
    item.startOffset = index;
    item.endOffset = index + item.quote.length;
  }
  state.currentBook = book;
  state.currentChapterId = chapter.id;
  state.route = 'reader';
  render();
  setTimeout(() => {
    const target = byId(`reader-paragraph-${item.paragraphIndex}`);
    if (!target) return showToast('原文片段已经无法定位；这条记录仍保留在本地。');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (kind === 'vocabulary') {
      target.classList.add('jump-highlight');
      setTimeout(() => target.classList.remove('jump-highlight'), 1800);
    } else {
      target.querySelector(`[data-annotation-id="${CSS.escape(item.id)}"]`)?.classList.add('jump-highlight');
    }
  }, 80);
}

async function importBook(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    showToast('正在读取文件…', 20_000);
    const book = await importBookFile(file);
    const duplicate = state.books.find((item) => item.versionHash === book.versionHash);
    if (duplicate) {
      state.currentBook = await mergeImportedCover(duplicate, book);
      state.currentChapterId = duplicate.currentChapterId || duplicate.chapters[0]?.id;
      state.route = 'reader';
      await refreshData();
      render();
      showToast(book.cover ? '这份内容已在书架，已补充原封面并打开现有版本。' : '这份内容已在书架，已打开现有版本。');
      return;
    }
    await store.put('books', book);
    await refreshData();
    state.currentBook = book;
    state.currentChapterId = book.chapters[0].id;
    state.route = 'reader';
    render();
    showToast(`《${book.title}》已导入。`);
  } catch (error) {
    showToast(error.message || '导入失败，请检查文件格式后重试。', 6000);
  }
}

async function importDictionary(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('词典文件超过 30 MB，暂不导入。');
    const parsed = parseDictionary(await file.text(), file.name);
    const entries = [...parsed].map(([word, definition]) => ({ word, definition }));
    await store.setDictionary(entries);
    await refreshData();
    render();
    showToast(entries.length ? `已载入 ${entries.length} 个本地词条。` : '自定义词典没有可用词条，将使用内置 ECDICT。');
  } catch (error) {
    showToast(error.message || '词典导入失败。', 6000);
  }
}

async function exportBackup() {
  try {
    const backup = await store.exportData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `koala-reading-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('备份文件已生成，请保存到安全位置。');
  } catch (error) {
    showToast(`导出失败：${error.message}`);
  }
}

async function restoreBackup(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 250 * 1024 * 1024) throw new Error('备份超过 250 MB，暂不恢复。');
    const data = JSON.parse(await file.text());
    await store.mergeBackup(data);
    await refreshData();
    render();
    showToast('备份已合并恢复；同 ID 的现有记录已保留。');
  } catch (error) {
    showToast(error.message || '恢复失败，请确认备份文件完整。', 6000);
  }
}

function showInfo() {
  byId('infoContent').innerHTML = `<p class="eyebrow">本机版说明</p><h2>支持格式与限制</h2><div class="info-sections"><section><h3>目前支持</h3><ul><li>本机导入 EPUB、TXT、Markdown；EPUB 按目录 spine 顺序读取正文。</li><li>已内置 ECDICT 免费英汉词库，也支持自定义 JSON 词典对象/词条数组，以及“单词 + Tab + 释义”的 TSV。</li><li>书籍、词典、阅读位置、词条、标记、笔记和乐园模拟数据保存在当前浏览器的 IndexedDB。</li><li>GitHub 外刊资源只检查文件元数据，不下载正文；书籍需要手动打开来源页面。</li><li>可导出完整 JSON 备份；恢复时按 ID 合并，不覆盖本地已有记录。</li></ul></section><section><h3>当前限制</h3><ul><li>EPUB 以纯文本重排显示，不保留原版排版、图片、复杂表格或脚注布局；加密 EPUB、ZIP64 和图片扫描版不支持。</li><li>不支持 PDF 阅读。导入文件最大 150 MB；词典最大 30 MB。</li><li>资源每 6 小时检查一次；本机服务停止时不会后台运行，GitHub 网络或 API 限制会延迟更新。</li><li>考拉币和玩具是本地模拟，不代表真实资产、订单或配送。</li><li>数据只属于当前浏览器配置文件。清理浏览器数据前请先导出备份。</li><li>复习采用固定间隔：答对 3 天、答错 1 天；不是 FSRS。</li></ul></section></div><p class="privacy-note">导入的 EPUB 按 XML 解析并转为纯文本，不会把书内 HTML 插入页面或执行其中脚本。</p>`;
  byId('infoDialog').showModal();
}

async function handleAction(button) {
  const { action, id } = button.dataset;
  if (action === 'garden-bed-select' || action === 'garden-flower-select') {
    if (state.parkGardenBusy) return;
    const bedId = button.dataset.bedId, flowerId = button.dataset.flowerId;
    if (action === 'garden-bed-select' && !GARDEN_BEDS.some((item) => item.id === bedId)) return;
    if (action === 'garden-flower-select' && !FLOWER_CATALOG.some((item) => item.id === flowerId)) return;
    parkUiRevision++;
    parkScene?.cancelGardenVisit?.(true);
    if (action === 'garden-bed-select') {
      state.parkGardenBed = bedId;
      state.parkGardenFlower = getGarden(state.game).beds.find((item) => item.id === bedId)?.flowerId || state.parkGardenFlower;
    } else state.parkGardenFlower = flowerId;
    state.parkPanel = 'garden';
    renderPlayground();
    view.querySelector(`[data-action="${action}"][${action === 'garden-bed-select' ? 'data-bed-id' : 'data-flower-id'}="${CSS.escape(bedId || flowerId)}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (['garden-visit', 'garden-plant', 'garden-water'].includes(action)) {
    if (state.parkGardenBusy) return showToast('正在保存照料结果，稍等一下。');
    const bedId = button.dataset.bedId;
    if (!GARDEN_BEDS.some((item) => item.id === bedId)) return;
    const planted = getGarden(state.game).beds.find((item) => item.id === bedId);
    const flowerId = action === 'garden-water' ? planted?.flowerId : button.dataset.flowerId;
    if (action === 'garden-plant' && !FLOWER_CATALOG.some((item) => item.id === flowerId)) return;
    if (action === 'garden-water' && !planted) throw new Error('先种一片喜欢的花，再来浇水吧。');
    parkUiRevision++;
    state.parkGardenBed = bedId;
    state.parkPanel = null;
    state.parkSelectedToy = null;
    renderPlayground();
    view.querySelector('.park-stage-live')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    view.querySelector('.park-canvas')?.focus({ preventScroll: true });
    const kind = action === 'garden-visit' ? 'open' : action === 'garden-plant' ? 'plant' : 'water';
    const started = parkScene?.visitGardenBed?.(bedId, { kind, flowerId, plantedAt: planted?.plantedAt });
    if (!started) showToast('考拉还在准备或保存照料结果，稍等一下再去花园。');
    return;
  }
  if (action === 'park-adventure-select') {
    if (!PARK_SECRETS.some((item) => item.id === button.dataset.secretId)) return;
    parkUiRevision++;
    state.parkSecret = button.dataset.secretId;
    state.parkPanel = 'adventure';
    renderPlayground();
    view.querySelector(`[data-action="park-adventure-select"][data-secret-id="${CSS.escape(state.parkSecret)}"]`)?.focus({ preventScroll: true });
    view.querySelector('.adventure-story')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    return;
  }
  if (action === 'park-secret-visit' || action === 'park-trail-run') {
    const secretId = button.dataset.secretId;
    if (action === 'park-secret-visit' && !PARK_SECRETS.some((item) => item.id === secretId)) return;
    parkUiRevision++;
    state.parkPanel = null;
    state.parkSelectedToy = null;
    renderPlayground();
    view.querySelector('.park-stage-live')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    view.querySelector('.park-canvas')?.focus({ preventScroll: true });
    const started = action === 'park-trail-run' ? parkScene?.startTrailRun?.() : parkScene?.visitSecret?.(secretId);
    if (!started) showToast('考拉大王还在准备，等模型加载完成后再试一下。');
    return;
  }
  if (action === 'park-runner-equip') {
    await saveParkChange((game) => equipWearable(equipWearable(game, 'trail-runner'), 'trail-visor'));
    showToast('越野背心和遮阳帽已穿好，去林间跑一圈吧！');
    return;
  }
  if (action === 'backfill-covers') return backfillCovers({ retry: true });
  if (action === 'wardrobe-equip' || action === 'wardrobe-buy') {
    const itemId = button.dataset.itemId;
    const wasOwned = getWardrobe(state.game).ownedIds.includes(itemId);
    await saveParkChange((game) => equipWearable(action === 'wardrobe-buy' ? purchaseWearable(game, itemId) : game, itemId));
    showToast(action === 'wardrobe-buy' && !wasOwned ? '已加入衣橱并穿戴，之后换装都免费。' : '新搭配已保存。');
    view.querySelector(`[data-wardrobe-item="${CSS.escape(itemId)}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'park-game-open') {
    parkScene?.cancelGardenVisit?.();
    await reloadParkState(false);
    parkGames.open(button.dataset.gameId);
    return;
  }
  if (action === 'park-npc') {
    if (!PARK_NPCS.some((npc) => npc.id === button.dataset.npcId)) return;
    parkUiRevision++;
    state.parkNpc = button.dataset.npcId;
    state.parkPanel = 'npc';
    state.parkSelectedToy = null;
    renderPlayground();
    focusParkPanel();
    return;
  }
  if (action === 'sync-discovery') return syncDiscovery();
  if (action === 'import-discovered') return importDiscoveredEpub(button);
  if (action === 'check-in') {
    const oldStickers = unlockedStickers(state.game).filter((item) => item.unlocked).map((item) => item.id);
    await saveParkChange(checkIn);
    const newSticker = unlockedStickers(state.game).find((item) => item.unlocked && !oldStickers.includes(item.id));
    showToast(newSticker ? `签到成功，获得 ${DAILY_CHECKIN_COINS} 枚考拉币和「${newSticker.name}」贴纸。` : `签到成功，获得 ${DAILY_CHECKIN_COINS} 枚考拉币。`);
    return;
  }
  if (action === 'purchase-toy') {
    await saveParkChange((game) => purchaseToy(game, button.dataset.toyId));
    showToast('已加入背包，打开背包就可以布置到草地上。');
    return;
  }
  if (action === 'park-retry') {
    parkScene?.dispose();
    parkScene = null;
    renderPlayground();
    return;
  }
  if (action === 'park-panel') {
    const panel = button.dataset.panel;
    if (!['adventure', 'garden', 'shop', 'bag', 'wardrobe', 'arrange', 'games', 'npc'].includes(panel)) return;
    parkUiRevision++;
    parkScene?.cancelGardenVisit?.();
    state.parkPanel = state.parkPanel === panel ? null : panel;
    state.parkSelectedToy = null;
    renderPlayground();
    if (state.parkPanel) focusParkPanel();
    else view.querySelector(`[data-panel="${panel}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'park-close') {
    parkUiRevision++;
    parkScene?.cancelGardenVisit?.();
    const panel = state.parkPanel;
    state.parkPanel = null;
    state.parkSelectedToy = null;
    renderPlayground();
    view.querySelector(`.park-dock [data-panel="${panel}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'park-select') {
    if (!state.game.ownedToyIds.includes(button.dataset.toyId)) throw new Error('请先在商店兑换这件摆设。');
    state.parkPanel = 'arrange';
    state.parkSelectedToy = button.dataset.toyId;
    renderPlayground();
    view.querySelector('.park-scene-status')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    view.querySelector('.park-canvas')?.focus({ preventScroll: true });
    return;
  }
  if (action === 'park-place' || action === 'park-remove') {
    const toyId = action === 'park-remove' ? button.dataset.toyId : state.parkSelectedToy;
    await saveParkChange((game) => placeToy(game, toyId, action === 'park-remove' ? null : button.dataset.slotId));
    state.parkSelectedToy = null;
    if (state.route === 'playground') renderPlayground();
    showToast(action === 'park-remove' ? '已收回背包，不扣除考拉币。' : '布置已保存，刷新后也会在这里。');
    return;
  }
  if (action === 'import-book') return byId('bookInput').click();
  if (action === 'dictionary-import') return byId('dictionaryInput').click();
  if (action === 'export') return exportBackup();
  if (action === 'restore') return byId('backupInput').click();
  if (action === 'about') return showInfo();
  if (action === 'read') return openBook(id);
  if (action === 'selection-lookup') return openLookup(state.selection);
  if (action === 'selection-annotate') return openAnnotationDialog(state.selection);
  if (action === 'font-smaller') { state.fontSize = Math.max(16, state.fontSize - 2); return renderReader(); }
  if (action === 'font-larger') { state.fontSize = Math.min(30, state.fontSize + 2); return renderReader(); }
  if (action === 'previous-chapter' || action === 'next-chapter') {
    await saveReaderPosition();
    const index = state.currentBook.chapters.findIndex((item) => item.id === state.currentChapterId);
    const target = state.currentBook.chapters[index + (action === 'next-chapter' ? 1 : -1)];
    if (target) { state.currentChapterId = target.id; renderReader(); }
    return;
  }
  if (action === 'save-word') return saveVocabulary();
  if (action === 'save-annotation') return saveAnnotation();
  if (action === 'jump-vocabulary') {
    const item = state.vocabulary.find((card) => card.id === id);
    if (item) await jumpToSource(item, 'vocabulary');
    return;
  }
  if (action === 'jump-annotation') {
    const item = state.annotations.find((note) => note.id === id);
    if (item) await jumpToSource(item, 'annotation');
    return;
  }
  if (action === 'remove-vocabulary' || action === 'remove-annotation') {
    await store.remove(action === 'remove-vocabulary' ? 'vocabulary' : 'annotations', id);
    await refreshData();
    render();
    showToast(action === 'remove-vocabulary' ? '词条已移除。' : '标记已移除。');
    return;
  }
  if (action === 'check-answer') return checkReviewAnswer();
  if (action === 'next-review') {
    state.reviewResult = null;
    state.reviewCard = state.vocabulary.find((card) => card.dueAt <= Date.now()) || null;
    renderReview();
  }
}

async function checkReviewAnswer() {
  const card = state.reviewCard;
  const input = byId('reviewAnswer');
  const cloze = findCloze(card?.sentence, card?.term);
  if (!card || !input || !cloze) return;
  if (!input.value.trim()) {
    input.focus();
    return showToast('先输入一个答案，想不起来也可以尝试。');
  }
  const correct = gradeAnswer(input.value, cloze.expected);
  const schedule = reviewSchedule(correct);
  const updated = { ...card, dueAt: schedule.dueAt, intervalDays: schedule.intervalDays, lastReviewedAt: Date.now(), lastCorrect: correct, reviewCount: (card.reviewCount || 0) + 1 };
  await store.put('vocabulary', updated);
  await refreshData();
  state.reviewCard = updated;
  state.reviewResult = { cardId: card.id, correct };
  renderReview();
}

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-route]');
  if (nav) {
    if (nav.dataset.route === 'reader' && nav.dataset.id) return openBook(nav.dataset.id);
    return routeTo(nav.dataset.route);
  }
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    try { await handleAction(actionButton); }
    catch (error) { showToast(error.message || '操作失败，请稍后重试。', 6000); }
  }
  const closeButton = event.target.closest('[data-dialog-close]');
  if (closeButton) byId(closeButton.dataset.dialogClose).close();
});

view.addEventListener('click', (event) => {
  if (state.route !== 'reader' || event.target.closest('button,select,input,textarea,a')) return;
  if (!window.getSelection()?.isCollapsed) return;
  const context = wordAtPoint(event);
  if (context) openLookup(context);
});

view.addEventListener('mouseup', () => {
  if (state.route !== 'reader') return;
  setTimeout(() => showSelectionTools(selectionContext()), 0);
});

view.addEventListener('keyup', (event) => {
  if (state.route === 'reader' && ['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    showSelectionTools(selectionContext());
  }
});

window.addEventListener('scroll', () => {
  if (state.route !== 'reader') return;
  clearTimeout(saveProgressTimer);
  saveProgressTimer = setTimeout(saveReaderPosition, 450);
}, { passive: true });
window.addEventListener('pagehide', () => {
  if (state.route === 'reader') saveReaderPosition();
});

byId('globalSearch').addEventListener('input', (event) => {
  state.search = event.target.value.trim();
  if (state.route !== 'reader') render();
});

byId('bookInput').addEventListener('change', (event) => importBook(event.currentTarget));
byId('dictionaryInput').addEventListener('change', (event) => importDictionary(event.currentTarget));
byId('backupInput').addEventListener('change', (event) => restoreBackup(event.currentTarget));
byId('saveWord').addEventListener('click', () => saveVocabulary().catch((error) => showToast(error.message)));
byId('manualDefinition').addEventListener('input', () => {
  if (state.lookup && !state.lookup.dictionaryDefinition) {
    byId('saveWord').disabled = !byId('manualDefinition').value.trim();
  }
});
byId('saveAnnotation').addEventListener('click', () => saveAnnotation().catch((error) => showToast(error.message)));
document.addEventListener('change', async (event) => {
  if (event.target.id !== 'chapterSelect') return;
  await saveReaderPosition();
  state.currentChapterId = event.target.value;
  renderReader();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.route === 'playground' && state.parkPanel && !parkGames.isOpen) {
    void handleAction({ dataset: { action: 'park-close' } });
  }
  if (event.key === 'Enter' && event.target.id === 'reviewAnswer') {
    event.preventDefault();
    checkReviewAnswer();
  }
});

setInterval(() => {
  if (state.staticHosting) return;
  if (!state.discoverySyncing && browserCatalogSyncDue()) void syncDiscovery({ silent: true });
  else if (state.route === 'resources' && !state.discoverySyncing) void pollDiscoverySnapshot();
  void processPendingAutoImports();
}, 30_000);

async function init() {
  try {
    await configureStorage();
    await store.open();
    await refreshData();
    render();
    void (async () => {
      await loadDiscovery();
      await backfillCovers();
      await processPendingAutoImports();
    })();
  } catch (error) {
    view.innerHTML = `<div class="fatal-state"><h1>书房暂时打不开</h1><p>${text(error.message)}</p><p>请确认浏览器能访问书房服务，并保持服务运行后刷新。</p></div>`;
  }
}

document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.classList.contains('real-book-cover')) return;
  image.closest('.book-cover')?.classList.remove('has-real-cover');
  image.remove();
}, true);

init();
