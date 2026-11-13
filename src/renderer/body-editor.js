/**
 * Body 编辑器 JSON 高亮与 Beautify
 */
import { bodyEditor, bodyType } from './dom.js';
import { highlightJson, escapeHtml, showToast } from './utils.js';
import { t } from './i18n.js';

const bodyHighlight = document.getElementById('body-highlight');
const bodyEditorWrapper = document.getElementById('body-editor-wrapper');
const multipartWrap = document.getElementById('multipart-wrap');
const formWrap = document.getElementById('form-wrap');
const btnBeautify = document.getElementById('btn-beautify');

/** 按 bodyType 切换编辑器形态：文本编辑器 / form 字段表 / multipart 字段表 */
function updateBodyModeVisibility() {
  const bType = bodyType.value;
  const isMultipart = bType === 'multipart';
  const isForm = bType === 'form';
  if (multipartWrap) multipartWrap.hidden = !isMultipart;
  if (formWrap) formWrap.hidden = !isForm;
  if (bodyEditorWrapper) bodyEditorWrapper.style.display = (isMultipart || isForm) ? 'none' : '';
  // Beautify 仅对 JSON 有意义
  if (btnBeautify) btnBeautify.style.display = bType === 'json' ? '' : 'none';
}

/** textarea 末尾换行会多渲染一个空行，高亮层需补一个换行才能保持行数与滚动高度一致 */
function withTrailingLine(text, html) {
  return text.endsWith('\n') ? html + '\n' : html;
}

/** 高亮层自身的右内边距（CSS 中的 12px），补滚动条宽度时以此为基准 */
let highlightPadRight = null;

/**
 * 让高亮层的内容宽度与 textarea 完全一致。
 * textarea 出现/隐藏纵向滚动条时内容宽度会变化（8px），高亮层若不同步，
 * 换行点就会不同 —— 字数相同的两段文字会排成不同样子，光标看起来就落在别的字符上。
 * 高亮层本身不带滚动条（CSS overflow:hidden），这里用 padding-right 补齐滚动条占用的宽度。
 */
function syncEditorWidth() {
  if (!bodyHighlight) return;
  if (highlightPadRight === null) {
    highlightPadRight = parseFloat(getComputedStyle(bodyHighlight).paddingRight) || 0;
  }
  const cs = getComputedStyle(bodyEditor);
  const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  const scrollbar = Math.max(0, bodyEditor.offsetWidth - bodyEditor.clientWidth - border);
  bodyHighlight.style.paddingRight = `${highlightPadRight + scrollbar}px`;
}

function updateBodyHighlight() {
  if (!bodyHighlight) return;

  updateBodyModeVisibility();
  syncEditorWidth();

  const text = bodyEditor.value;
  if (bodyType.value === 'json' && text) {
    let html;
    try {
      JSON.parse(text);
      html = highlightJson(text);
    } catch {
      html = escapeHtml(text);
    }
    bodyHighlight.innerHTML = `<code>${withTrailingLine(text, html)}</code>`;
    bodyHighlight.style.display = 'block';
    bodyEditor.classList.add('has-highlight');
  } else {
    bodyHighlight.style.display = 'none';
    bodyEditor.classList.remove('has-highlight');
  }

  // innerHTML 重建可能重置高亮层滚动位置，需与编辑器重新对齐
  syncScroll();
}

function syncScroll() {
  if (bodyHighlight) {
    bodyHighlight.scrollTop = bodyEditor.scrollTop;
    bodyHighlight.scrollLeft = bodyEditor.scrollLeft;
  }
}

export function initBodyEditor() {
  if (!bodyHighlight) return;

  bodyEditor.addEventListener('input', updateBodyHighlight);
  bodyEditor.addEventListener('scroll', syncScroll);
  bodyType.addEventListener('change', updateBodyHighlight);

  // 面板缩放 / 滚动条出现或消失都会改变编辑区宽度，需重新对齐高亮层
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      syncEditorWidth();
      syncScroll();
    }).observe(bodyEditor);
  }

  updateBodyHighlight();
}

export function beautifyBody() {
  if (bodyType.value !== 'json') {
    showToast(t('msg.beautifyJsonOnly'));
    return;
  }
  try {
    const json = JSON.parse(bodyEditor.value);
    bodyEditor.value = JSON.stringify(json, null, 2);
    updateBodyHighlight();
  } catch {
    showToast(t('msg.invalidJson'));
  }
}

export { updateBodyHighlight };
