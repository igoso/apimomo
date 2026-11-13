/**
 * Ctrl+F 查找栏
 * 支持两个目标：
 *  - body：请求体编辑器（基于高亮层 overlay 渲染匹配标记，编辑器选区联动）
 *  - response：响应区（遍历当前视图 DOM 文本节点包裹 <span class="find-match">）
 * 快捷键：Ctrl/Cmd+F 打开，Enter/F3 下一个，Shift+Enter/Shift+F3 上一个，Esc 关闭
 */
import { bodyEditor, bodyType } from './dom.js';
import { updateBodyHighlight } from './body-editor.js';
import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

const bodyHighlight = document.getElementById('body-highlight');
const responseBody = document.getElementById('response-body');

const state = {
  mode: null,        // 'body' | 'response' | null
  query: '',
  matches: [],       // body: [{start,end}] / response: [span]
  idx: 0,
  bar: null,
  input: null,
  countEl: null,
  snapshotHTML: null, // 响应区搜索前的原始 HTML，用于还原匹配标记
  timer: null
};

let observer = null;

// ==================== 工具 ====================

function scheduleSearch(delay = 120) {
  clearTimeout(state.timer);
  state.timer = setTimeout(runSearch, delay);
}

function updateCount() {
  if (!state.countEl) return;
  state.countEl.textContent = state.query
    ? `${Math.min(state.idx + 1, state.matches.length)}/${state.matches.length}`
    : '0/0';
}

function findPositions(text, queryLower) {
  const positions = [];
  let from = 0;
  let r;
  while ((r = text.toLowerCase().indexOf(queryLower, from)) !== -1) {
    positions.push(r);
    from = r + queryLower.length;
  }
  return positions;
}

function clampIdx() {
  if (state.matches.length === 0) {
    state.idx = 0;
  } else if (state.idx >= state.matches.length) {
    state.idx = state.idx % state.matches.length;
  }
}

// ==================== body 编辑器搜索 ====================

function runBodySearch() {
  if (!bodyHighlight) return;
  const q = state.query.toLowerCase();

  if (!q) {
    state.matches = [];
    updateBodyHighlight(); // 还原正常高亮状态
    updateCount();
    return;
  }

  const text = bodyEditor.value;
  const positions = findPositions(text, q);
  state.matches = positions.map(p => ({ start: p, end: p + q.length }));
  clampIdx();

  // 搜索期间用纯文本渲染 overlay 并标记匹配（暂不与 JSON 着色混排）
  let html = '';
  let last = 0;
  positions.forEach((p, i) => {
    html += escapeHtml(text.slice(last, p));
    html += `<span class="find-match${i === state.idx ? ' current' : ''}" data-idx="${i}">${escapeHtml(text.slice(p, p + q.length))}</span>`;
    last = p + q.length;
  });
  html += escapeHtml(text.slice(last));

  // 与编辑器保持一致：末尾换行时高亮文本同样需要多一个空行
  bodyHighlight.innerHTML = `<code>${html}${text.endsWith('\n') ? '\n' : ''}</code>`;
  bodyHighlight.style.display = 'block';
  bodyEditor.classList.add('has-highlight');

  // 通过 overlay 中当前匹配元素的位置滚动编辑器（两层布局一致，滚动 1:1 同步）
  const cur = bodyHighlight.querySelector(`.find-match[data-idx="${state.idx}"]`);
  if (cur) {
    bodyEditor.scrollTop = Math.max(0, cur.offsetTop - bodyEditor.clientHeight / 2);
    bodyHighlight.scrollTop = bodyEditor.scrollTop;
  }

  // 编辑器选区联动（便于直接续编辑），不影响查找输入框焦点
  if (positions.length > 0) {
    const m = state.matches[state.idx];
    bodyEditor.setSelectionRange(m.start, m.end);
  }
  updateCount();
}

// ==================== 响应区搜索 ====================

/**
 * 遍历 root 下文本节点，把命中部分包裹为 <span class="find-match">
 * 跳过行号列（.pretty-gutter）、脚本与样式
 */
function markTextNodes(root, queryLower) {
  const spans = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest('.pretty-gutter') || p.closest('.find-bar')) return NodeFilter.FILTER_REJECT;
      const tag = p.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const text = node.data;
    if (!text) continue;
    const lower = text.toLowerCase();
    if (!lower.includes(queryLower)) continue;

    const positions = findPositions(text, queryLower);
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const p of positions) {
      if (p > last) frag.appendChild(document.createTextNode(text.slice(last, p)));
      const span = document.createElement('span');
      span.className = 'find-match';
      span.textContent = text.slice(p, p + queryLower.length);
      frag.appendChild(span);
      spans.push(span);
      last = p + queryLower.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
  return spans;
}

function runResponseSearch() {
  if (!responseBody) return;
  const q = state.query.toLowerCase();

  // 还原上一轮匹配标记
  if (state.snapshotHTML !== null) {
    observer.disconnect();
    responseBody.innerHTML = state.snapshotHTML;
  }

  if (!q) {
    state.snapshotHTML = null;
    state.matches = [];
    updateCount();
    if (state.mode === 'response') {
      observer.observe(responseBody, { childList: true, subtree: true });
    }
    return;
  }

  state.snapshotHTML = responseBody.innerHTML;
  // 标记过程会修改 DOM，先断开 observer 避免自触发
  observer.disconnect();
  state.matches = markTextNodes(responseBody, q);
  clampIdx();
  scrollToCurrent(true);

  if (state.mode === 'response') {
    observer.observe(responseBody, { childList: true, subtree: true });
  }
  updateCount();
}

function scrollToCurrent(toggleClass = false) {
  if (state.matches.length === 0) return;
  if (toggleClass) {
    state.matches.forEach((s, i) => s.classList.toggle('current', i === state.idx));
  }
  const cur = state.matches[state.idx];
  if (cur && cur.scrollIntoView) {
    cur.scrollIntoView({ block: 'center' });
  }
}

// ==================== 调度 ====================

function runSearch() {
  if (state.mode === 'body') runBodySearch();
  else if (state.mode === 'response') runResponseSearch();
}

function goto(delta) {
  if (state.matches.length === 0) return;
  state.idx = (state.idx + delta + state.matches.length) % state.matches.length;
  if (state.mode === 'body') {
    runBodySearch();
  } else {
    scrollToCurrent(true);
    updateCount();
  }
}

// ==================== 查找栏 UI ====================

function buildBar() {
  const bar = document.createElement('div');
  bar.className = 'find-bar';

  const input = document.createElement('input');
  input.type = 'text';
  input.spellcheck = false;
  input.placeholder = t('find.placeholder');
  input.setAttribute('data-i18n-placeholder', 'find.placeholder');

  const count = document.createElement('span');
  count.className = 'find-count';
  count.textContent = '0/0';

  const prev = document.createElement('button');
  prev.className = 'find-btn';
  prev.textContent = '↑';
  prev.title = t('find.prev');
  prev.setAttribute('data-i18n-title', 'find.prev');
  prev.addEventListener('click', () => goto(-1));

  const next = document.createElement('button');
  next.className = 'find-btn';
  next.textContent = '↓';
  next.title = t('find.next');
  next.setAttribute('data-i18n-title', 'find.next');
  next.addEventListener('click', () => goto(1));

  const closeBtn = document.createElement('button');
  closeBtn.className = 'find-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = t('find.close');
  closeBtn.setAttribute('data-i18n-title', 'find.close');
  closeBtn.addEventListener('click', () => closeFindBar());

  input.addEventListener('input', () => {
    state.query = input.value;
    state.idx = 0;
    scheduleSearch();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goto(e.shiftKey ? -1 : 1);
    }
  });

  bar.append(input, count, prev, next, closeBtn);
  state.bar = bar;
  state.input = input;
  state.countEl = count;
}

function openFindBar(target) {
  if (state.mode === target && state.bar) {
    state.input.select();
    state.input.focus();
    return;
  }
  if (state.mode) closeFindBar();

  state.mode = target;
  state.query = '';
  state.matches = [];
  state.idx = 0;
  state.snapshotHTML = null;
  buildBar();

  const host = target === 'body'
    ? document.querySelector('.body-editor-wrapper')
    : document.querySelector('.response-panel');
  if (!host) { state.mode = null; return; }
  host.appendChild(state.bar);

  if (target === 'response' && observer) {
    observer.observe(responseBody, { childList: true, subtree: true });
  }

  state.input.focus();
}

function closeFindBar() {
  if (state.mode === 'body') {
    updateBodyHighlight(); // 还正常 JSON 高亮
    bodyEditor.focus({ preventScroll: true });
  } else if (state.mode === 'response' && observer) {
    observer.disconnect();
    if (state.snapshotHTML !== null && responseBody) {
      responseBody.innerHTML = state.snapshotHTML; // 移除匹配标记
    }
  }
  if (state.bar) state.bar.remove();
  state.bar = null;
  state.input = null;
  state.countEl = null;
  state.mode = null;
  state.matches = [];
  state.snapshotHTML = null;
  clearTimeout(state.timer);
}

// ==================== 初始化 ====================

export function initFindBar() {
  if (!bodyHighlight || !responseBody) return;

  observer = new MutationObserver(() => {
    if (state.mode !== 'response') return;
    // 外部重渲染（新响应/切换 Tab/流式更新）会整体替换内容，快照已失效
    state.snapshotHTML = null;
    state.idx = 0;
    scheduleSearch(150);
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const target = document.activeElement === bodyEditor ? 'body' : 'response';
      openFindBar(target);
    } else if (e.key === 'F3' && state.mode) {
      e.preventDefault();
      goto(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape' && state.mode) {
      closeFindBar();
    }
  });

  // 查找激活期间编辑器内容或类型变化时，自动重新搜索
  bodyEditor.addEventListener('input', () => {
    if (state.mode === 'body') { state.idx = 0; scheduleSearch(); }
  });
  bodyType.addEventListener('change', () => {
    if (state.mode === 'body') { state.idx = 0; scheduleSearch(0); }
  });
}
