/**
 * 通用工具函数
 */

import { t } from './i18n.js';

/**
 * 非阻塞式 toast 提示（替代 alert，避免 Electron 模态对话框焦点丢失问题）
 */
let toastTimer = null;
export function showToast(message, duration = 2500) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function truncateUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url.length > 50 ? url.substring(0, 50) + '...' : url;
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function highlightJson(json) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

/**
 * XML 语法高亮
 * 高亮：标签名、属性名、属性值、注释、CDATA、处理指令
 */
export function highlightXml(xml) {
  // 先转义 HTML 实体
  xml = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return xml.replace(
    // 注释 <!-- ... -->
    /&lt;!--([\s\S]*?)--&gt;/g,
    '<span class="xml-comment">&lt;!--$1--&gt;</span>'
  ).replace(
    // CDATA <![CDATA[ ... ]]>
    /&lt;!\[CDATA\[([\s\S]*?)\]\]&gt;/g,
    '<span class="xml-cdata">&lt;![CDATA[$1]]&gt;</span>'
  ).replace(
    // 处理指令 <?xml ... ?>
    /&lt;\?([\s\S]*?)\?&gt;/g,
    '<span class="xml-prolog">&lt;?$1?&gt;</span>'
  ).replace(
    // 自闭合标签 <tagname ... /> 和 开标签 <tagname ...> 和 关标签 </tagname>
    /&lt;\/?[\w:.-]+(?:\s+[\s\S]*?)?\/?&gt;/g,
    function (tagMatch) {
      // 拆分标签名和属性部分
      return tagMatch.replace(
        // 标签名部分（紧随 < 或 </ 之后，到第一个空白或 /> 或 >）
        /^(&lt;\/?)([\w:.-]+)/,
        '$1<span class="xml-tag">$2</span>'
      ).replace(
        // 属性名="属性值"
        /([\w:.-]+)(=)(&quot;[^&]*?(?:&amp;[^;]*;)?[^&]*?&quot;)/g,
        '<span class="xml-attr">$1</span>$2<span class="xml-attr-value">$3</span>'
      ).replace(
        // 无值属性（如 xmlns）
        /\s([\w:.-]+)(?=\s|\/|&gt;)/g,
        ' <span class="xml-attr">$1</span>'
      );
    }
  );
}

/**
 * 为格式化后的 HTML 内容添加行号
 * 输出两列结构：左侧 .pretty-gutter（行号列）+ 右侧 .pretty-code（代码列）
 * 行号列使用 sticky 定位，横向滚动时固定在左侧
 */
export function addLineNumbers(htmlContent) {
  const lines = htmlContent.split('\n');
  const totalLines = lines.length;

  const gutterHtml = lines.map((_, i) => {
    const num = i + 1;
    return `<div class="gutter-num">${num}</div>`;
  }).join('');

  const codeHtml = lines.map(line => {
    return `<div class="code-line">${line || ' '}</div>`;
  }).join('');

  return `<div class="pretty-view"><div class="pretty-gutter">${gutterHtml}</div><div class="pretty-code">${codeHtml}</div></div>`;
}

/**
 * 解析 SSE (Server-Sent Events) 文本块
 * OpenAI 流式格式：每行以 "data: " 开头，最后一行为 "data: [DONE]"
 * @param {string} text - 原始 SSE 文本（可能包含多个事件）
 * @returns {Array<{type: 'content'|'thinking'|'done'|'error', text?: string, raw?: string}>}
 */
export function parseSSEChunks(text) {
  const results = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) continue; // 空行或注释跳过

    if (!trimmed.startsWith('data:')) continue;

    const data = trimmed.slice(5).trim();

    if (data === '[DONE]') {
      results.push({ type: 'done' });
      continue;
    }

    try {
      const json = JSON.parse(data);

      // OpenAI Chat Completions 格式
      if (json.choices && Array.isArray(json.choices)) {
        for (const choice of json.choices) {
          const delta = choice.delta || {};

          // thinking / reasoning_content（DeepSeek 等）
          if (delta.reasoning_content != null) {
            results.push({ type: 'thinking', text: delta.reasoning_content, raw: data });
          }
          // thinking 字段（部分提供商）
          else if (delta.thinking != null) {
            results.push({ type: 'thinking', text: delta.thinking, raw: data });
          }
          // 标准 content
          if (delta.content != null) {
            results.push({ type: 'content', text: delta.content, raw: data });
          }
        }
      }

      // OpenAI Responses API 格式
      if (json.type === 'response.output_text.delta' && json.delta) {
        results.push({ type: 'content', text: json.delta, raw: data });
      }
      if (json.type === 'response.reasoning.delta' && json.delta) {
        results.push({ type: 'thinking', text: json.delta, raw: data });
      }

      // 错误事件
      if (json.error) {
        results.push({ type: 'error', text: json.error.message || JSON.stringify(json.error), raw: data });
      }
    } catch {
      // 无法解析为 JSON，当作原始文本
      if (data) {
        results.push({ type: 'content', text: data, raw: data });
      }
    }
  }

  return results;
}

/**
 * 检测请求是否为流式请求（OpenAI API 风格）
 * @param {string} body - 请求体
 * @param {Object} headers - 请求头
 * @returns {boolean}
 */
export function isStreamRequest(body, headers) {
  // 检查请求头是否请求 SSE
  const accept = headers['Accept'] || headers['accept'] || '';
  if (accept.includes('text/event-stream')) return true;

  // 检查请求体是否包含 stream: true
  if (body) {
    try {
      const json = JSON.parse(body);
      if (json.stream === true) return true;
    } catch {
      // 非 JSON，检查文本中是否包含流式标识
      if (/"stream"\s*:\s*true/.test(body)) return true;
    }
  }

  return false;
}

/**
 * 计算时间戳对应的本地日历日期 key（YYYY-MM-DD）
 * @param {number|string} timestamp
 * @returns {string}
 */
export function getDateKey(timestamp) {
  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function groupByDate(items) {
  const groups = {};
  const now = new Date();
  // 按日历日期比较，而不是相对小时差
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  items.forEach(item => {
    const d = new Date(item.timestamp);
    const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    let label;
    if (itemDate.getTime() === today.getTime()) {
      label = t('date.today');
    } else if (itemDate.getTime() === yesterday.getTime()) {
      label = t('date.yesterday');
    } else {
      label = getDateKey(item.timestamp);
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });
  return groups;
}
