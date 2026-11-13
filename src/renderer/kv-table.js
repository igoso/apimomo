/**
 * Key-Value 表格操作模块（Params / Headers）
 */
import { escapeHtml } from './utils.js';

// 常见 HTTP 请求头（Headers 行的 Key 输入建议）
const COMMON_HEADERS = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Disposition',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Date',
  'Expect',
  'Forwarded',
  'From',
  'Host',
  'Idempotency-Key',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'If-Unmodified-Since',
  'Max-Forwards',
  'Origin',
  'Pragma',
  'Proxy-Authorization',
  'Range',
  'Referer',
  'TE',
  'Trailer',
  'Transfer-Encoding',
  'Upgrade',
  'User-Agent',
  'Via',
  'Warning',
  'X-API-Key',
  'X-CSRF-Token',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Real-IP',
  'X-Request-Id',
  'X-Requested-With'
];

// ==================== Headers Key 下拉建议 ====================

let suggestPanel = null;
let suggestInput = null;
let suggestItems = [];
let suggestIndex = -1;
// 键盘导航开始前的输入框原值（Escape 时恢复）
let suggestBaseValue = null;

function ensureSuggestPanel() {
  if (!suggestPanel) {
    suggestPanel = document.createElement('div');
    suggestPanel.className = 'header-suggest';
    suggestPanel.style.display = 'none';
    // 阻止默认行为，避免点击选项时输入框失焦
    suggestPanel.addEventListener('mousedown', e => e.preventDefault());
    document.body.appendChild(suggestPanel);
  }
  return suggestPanel;
}

function hideHeaderSuggest() {
  if (suggestPanel) suggestPanel.style.display = 'none';
  suggestInput = null;
  suggestItems = [];
  suggestIndex = -1;
  suggestBaseValue = null;
}

function isSuggestVisible() {
  return suggestPanel && suggestPanel.style.display === 'block';
}

/** 过滤常见 header：包含匹配，前缀匹配优先 */
function filterCommonHeaders(keyword) {
  const kw = keyword.toLowerCase();
  return COMMON_HEADERS
    .filter(h => h.toLowerCase().includes(kw))
    .sort((a, b) => (a.toLowerCase().startsWith(kw) ? 0 : 1) - (b.toLowerCase().startsWith(kw) ? 0 : 1));
}

function renderSuggestList(items) {
  suggestItems = items;
  suggestIndex = items.length > 0 ? 0 : -1;
  suggestPanel.innerHTML = items.map((h, i) =>
    `<div class="header-suggest-item${i === 0 ? ' highlighted' : ''}">${h}</div>`
  ).join('');
  suggestPanel.querySelectorAll('.header-suggest-item').forEach((el, i) => {
    el.addEventListener('click', () => applyHeaderSuggest(items[i]));
  });
}

function showHeaderSuggest(input) {
  ensureSuggestPanel();
  suggestInput = input;

  const matched = filterCommonHeaders(input.value.trim());
  if (matched.length === 0) {
    hideHeaderSuggest();
    return;
  }
  renderSuggestList(matched);

  const rect = input.getBoundingClientRect();
  suggestPanel.style.left = rect.left + 'px';
  suggestPanel.style.top = (rect.bottom + 2) + 'px';
  suggestPanel.style.width = rect.width + 'px';
  suggestPanel.style.display = 'block';
}

function applyHeaderSuggest(headerName) {
  if (!suggestInput) return;
  const input = suggestInput;
  input.value = headerName;
  hideHeaderSuggest();
  input.focus();
}

function moveSuggest(step) {
  if (suggestItems.length === 0) return;
  suggestIndex = (suggestIndex + step + suggestItems.length) % suggestItems.length;
  const els = suggestPanel.querySelectorAll('.header-suggest-item');
  els.forEach((el, i) => el.classList.toggle('highlighted', i === suggestIndex));
  els[suggestIndex]?.scrollIntoView({ block: 'nearest' });

  // 键盘导航时实时回填高亮项，使上下键即可选中（Escape 可恢复原始输入）
  if (suggestInput) {
    if (suggestBaseValue === null) suggestBaseValue = suggestInput.value;
    suggestInput.value = suggestItems[suggestIndex];
    suggestInput.setSelectionRange(suggestInput.value.length, suggestInput.value.length);
  }
}

function attachHeaderSuggest(input) {
  input.addEventListener('focus', () => showHeaderSuggest(input));
  input.addEventListener('click', () => showHeaderSuggest(input));
  input.addEventListener('input', () => showHeaderSuggest(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      isSuggestVisible() ? moveSuggest(1) : showHeaderSuggest(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isSuggestVisible()) moveSuggest(-1);
    } else if (e.key === 'Enter') {
      if (isSuggestVisible() && suggestItems.length > 0) {
        e.preventDefault();
        applyHeaderSuggest(suggestItems[suggestIndex >= 0 ? suggestIndex : 0]);
      }
    } else if (e.key === 'Escape') {
      // 恢复键盘浏览前的原始输入
      if (suggestBaseValue !== null) input.value = suggestBaseValue;
      hideHeaderSuggest();
    }
  });
  // 面板打开时，鼠标停在输入框上滚动滚轮也可滚动列表
  input.addEventListener('wheel', (e) => {
    if (isSuggestVisible() && suggestInput === input) {
      e.preventDefault();
      suggestPanel.scrollTop += e.deltaY;
    }
  }, { passive: false });
  input.addEventListener('blur', hideHeaderSuggest);
}

// 滚动或窗口尺寸变化时关闭下拉，避免位置错位（忽略下拉面板自身的滚动）
window.addEventListener('scroll', (e) => {
  if (e.target === suggestPanel) return;
  if (isSuggestVisible()) hideHeaderSuggest();
}, true);
window.addEventListener('resize', () => { if (isSuggestVisible()) hideHeaderSuggest(); });

export function renderKVTable(type, items) {
  const table = document.getElementById(`${type}-table`);
  table.innerHTML = `
    <div class="kv-row kv-header">
      <span></span>
      <span>Key</span>
      <span>Value</span>
      <span>Description</span>
      <span></span>
    </div>
  `;
  items.forEach(item => addKVRow(type, item));
  addKVRow(type);
}

export function addKVRow(type, data = {}) {
  const table = document.getElementById(`${type}-table`);
  const row = document.createElement('div');
  row.className = 'kv-row';
  // 默认勾选（发送时携带）；回填历史/集合时按 enabled 恢复勾选状态（旧数据无此字段 → 默认勾选）
  const checked = data.enabled === false ? '' : 'checked';
  row.innerHTML = `
    <input type="checkbox" class="kv-check" ${checked}>
    <input type="text" placeholder="Key" value="${escapeHtml(data.key || '')}" class="kv-key" spellcheck="false">
    <input type="text" placeholder="Value" value="${escapeHtml(data.value || '')}" class="kv-value" spellcheck="false">
    <input type="text" placeholder="Description" value="${escapeHtml(data.desc || '')}" class="kv-desc" spellcheck="false">
    <span class="kv-remove" title="Remove">
      <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>
    </span>
  `;
  row.querySelector('.kv-remove').addEventListener('click', () => {
    row.remove();
  });
  // Headers 行的 Key 输入框提供常见 header 名称下拉建议
  if (type === 'headers') {
    attachHeaderSuggest(row.querySelector('.kv-key'));
  }
  table.appendChild(row);
}

export function getKVItems(type) {
  const rows = document.querySelectorAll(`#${type}-table .kv-row:not(.kv-header)`);
  const items = [];
  rows.forEach(row => {
    const key = row.querySelector('.kv-key').value.trim();
    if (key) {
      items.push({
        key,
        value: row.querySelector('.kv-value').value,
        desc: row.querySelector('.kv-desc').value,
        enabled: row.querySelector('.kv-check').checked
      });
    }
  });
  return items;
}
