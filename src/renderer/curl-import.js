/**
 * cURL 导入模块
 * 使用 curlconverter 库解析 cURL 命令
 */
import {
  methodSelect, urlInput, bodyEditor, bodyType,
  curlInput, modalImport
} from './dom.js';
import { closeModal } from './modal.js';
import { renderKVTable } from './kv-table.js';
import { updateBodyHighlight } from './body-editor.js';
import { t } from './i18n.js';
import { showToast } from './utils.js';

const cc = window.require('curlconverter');

/**
 * 预处理 cURL 命令：
 * - 去掉 bash 续行符（\<换行>）
 * - 将 --data-xxx=value 等号形式规范化为空格分隔形式（curlconverter 不识别等号形式）
 */
function normalizeCommand(command) {
  let s = command.replace(/\\\r?\n[ \t]*/g, ' ');
  s = s.replace(/(^|\s)(--data(?:-ascii|-raw|-binary|-urlencode|-cbor)?|--json)=/g, '$1$2 ');
  return s;
}

/** 按 curl 规则做 URL 编码（仅保留 A-Za-z0-9-._~），用于 --data-urlencode */
function urlencodeCurl(str) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** 从 s[i] 处读取一个 shell 单词，支持单引号 / 双引号 / $'...' ANSI-C 引号 */
function readShellWord(s, i) {
  let value = '';
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === "'") {
      // 单引号内为字面内容，直到下一个单引号
      const end = s.indexOf("'", i + 1);
      if (end === -1) { value += s.slice(i + 1); return { value, next: n }; }
      value += s.slice(i + 1, end);
      i = end + 1;
    } else if (c === '$' && s[i + 1] === "'") {
      // ANSI-C 引号：解析 \n \t \\ 等转义序列
      i += 2;
      while (i < n && s[i] !== "'") {
        if (s[i] === '\\' && i + 1 < n) {
          const e = s[i + 1];
          if (e === 'x') {
            const m = /^\\x([0-9a-fA-F]{1,2})/.exec(s.slice(i));
            if (m) { value += String.fromCharCode(parseInt(m[1], 16)); i += m[0].length; continue; }
            value += e; i += 2;
          } else {
            const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\a', b: '\b', f: '\f', v: '\v', e: '\x1b' };
            value += (map[e] !== undefined) ? map[e] : e;
            i += 2;
          }
        } else {
          value += s[i]; i++;
        }
      }
      i++;
    } else if (c === '"') {
      // 双引号内仅 \" \\ \` \$ 与换行续接有特殊含义
      i++;
      while (i < n && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < n) {
          const e = s[i + 1];
          if (e === '"' || e === '\\' || e === '`' || e === '$') { value += e; i += 2; }
          else if (e === '\n') { i += 2; }
          else { value += s[i]; i++; }
        } else {
          value += s[i]; i++;
        }
      }
      i++;
    } else if (c === '\\' && i + 1 < n) {
      value += s[i + 1];
      i += 2;
    } else if (/\s/.test(c)) {
      break;
    } else {
      value += c;
      i++;
    }
  }
  return { value, next: i };
}

const DATA_FLAGS = new Set([
  '-d', '--data', '--data-ascii', '--data-raw', '--data-binary',
  '--data-urlencode', '--data-cbor', '--json'
]);

/** 扫描命令中所有 --data 系列参数的值 */
function extractDataArgs(command) {
  const args = [];
  let i = 0;
  while (i < command.length) {
    while (i < command.length && /\s/.test(command[i])) i++;
    if (i >= command.length) break;
    const word = readShellWord(command, i);
    i = word.next;
    if (DATA_FLAGS.has(word.value)) {
      while (i < command.length && /\s/.test(command[i])) i++;
      if (i < command.length) {
        const val = readShellWord(command, i);
        i = val.next;
        args.push({ flag: word.value, value: val.value });
      }
    } else if (word.value.length > 2 && word.value.startsWith('-d')) {
      // -dvalue 短选项紧贴形式
      args.push({ flag: '-d', value: word.value.slice(2) });
    }
  }
  return args;
}

/**
 * 从命令原文恢复 body 原文（保真，不经过 JSON 解析）
 * 多段数据按 curl 实际行为用 & 拼接；@file / @- 引用无法恢复时返回 null
 */
function recoverRawBody(command) {
  const args = extractDataArgs(command);
  if (args.length === 0) return null;
  const pieces = [];
  for (const { flag, value } of args) {
    if (value.startsWith('@')) return null;
    if (flag === '--data-urlencode') {
      const at = value.indexOf('@');
      const eq = value.indexOf('=');
      if (at !== -1 && (eq === -1 || at < eq)) return null; // name@file 引用
      // curl 规则：name=content 仅编码 content；其余整体编码
      if (eq > 0) pieces.push(value.slice(0, eq + 1) + urlencodeCurl(value.slice(eq + 1)));
      else pieces.push(urlencodeCurl(value));
    } else {
      pieces.push(value);
    }
  }
  return pieces.length === 1 ? pieces[0] : pieces.join('&');
}

/** 大小写不敏感地读取 Content-Type 请求头 */
function getContentType(parsed) {
  const h = parsed.headers || {};
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === 'content-type') return String(h[k]);
  }
  return '';
}

function extractBody(command, parsed) {
  const contentType = getContentType(parsed);
  let body = '';
  let detectedBodyType = 'none';

  if (parsed.files) {
    // multipart (-F)：字段与文件拼为可读伪 body
    const parts = [];
    if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
      Object.entries(parsed.data).forEach(([key, value]) => {
        parts.push(`${key}=${value}`);
      });
    } else if (typeof parsed.data === 'string') {
      parts.push(parsed.data);
    }
    Object.entries(parsed.files).forEach(([key, value]) => {
      parts.push(`${key}=${value} (file)`);
    });
    return { body: parts.join('\n'), bodyType: 'multipart' };
  }

  // 优先从命令原文恢复，避免 curlconverter 解析为对象后
  // 丢失顶层数组/标量、重复键、大数字精度及原始格式
  const raw = recoverRawBody(command);
  if (raw !== null && raw !== '') {
    body = raw;
  } else if (parsed.data !== undefined && parsed.data !== null) {
    if (typeof parsed.data === 'string') {
      body = parsed.data;
    } else if (typeof parsed.data === 'object') {
      if (!Array.isArray(parsed.data) && contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams();
        Object.entries(parsed.data).forEach(([key, value]) => {
          params.append(key, String(value));
        });
        body = params.toString();
      } else {
        // 含顶层数组在内的任意 JSON 结构
        body = JSON.stringify(parsed.data, null, 2);
      }
    } else {
      // JSON 顶层数字 / 布尔
      body = String(parsed.data);
    }
  }

  if (body) {
    if (contentType.includes('json')) {
      detectedBodyType = 'json';
    } else if (contentType.includes('x-www-form-urlencoded')) {
      detectedBodyType = 'form';
    } else if (contentType.includes('multipart/form-data')) {
      detectedBodyType = 'multipart';
    } else {
      detectedBodyType = 'text';
      try {
        JSON.parse(body);
        detectedBodyType = 'json';
      } catch {}
    }
  }

  return { body, bodyType: detectedBodyType };
}

function parseCurl(command) {
  const result = {
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    body: '',
    bodyType: 'none'
  };

  try {
    const normalized = normalizeCommand(command);
    const parsed = JSON.parse(cc.toJsonString(normalized));

    result.method = (parsed.method || 'GET').toUpperCase();
    result.url = parsed.raw_url || parsed.url || '';
    const bodyResult = extractBody(normalized, parsed);
    result.body = bodyResult.body;
    result.bodyType = bodyResult.bodyType;

    // 转换 headers 为数组格式
    const headers = parsed.headers || {};
    result.headers = Object.entries(headers).map(([key, value]) => ({
      key,
      value: String(value),
      desc: ''
    }));

    // 从 URL 中提取查询参数（URL 保留 query，与 Params 表互为镜像；同名参数后值覆盖前值）
    if (result.url) {
      try {
        const urlObj = new URL(result.url);
        urlObj.searchParams.forEach((value, key) => {
          const exist = result.params.find(p => p.key === key);
          if (exist) exist.value = value;
          else result.params.push({ key, value, desc: '' });
        });
      } catch {}
    }
  } catch (e) {
    console.error('Parse curl error:', e);
    showToast(t('msg.parseCurlFailed') + e.message);
  }

  return result;
}

export function importCurl() {
  const command = curlInput.value.trim();
  if (!command) {
    showToast(t('msg.pleasePasteCurl'));
    return;
  }

  applyCurlCommand(command);

  closeModal('modal-import');
  curlInput.value = '';
}

/**
 * 检测文本是否为 cURL 命令
 */
export function isCurlCommand(text) {
  const trimmed = text.trim();
  // 以 curl 开头，或包含 curl 常用参数标志
  if (/^curl\s/i.test(trimmed)) return true;
  // 多行情况下第二行以常见 curl 参数开头（如 -X, -H, -d 等）
  if (/^curl\s\S.*\\\s*$/m.test(trimmed) || /^curl\s[\s\S]*-[XHdD]/m.test(trimmed)) return true;
  return false;
}

/**
 * 解析 cURL 命令并填充到请求表单
 */
export function applyCurlCommand(command) {
  const parsed = parseCurl(command);

  methodSelect.value = parsed.method;
  urlInput.value = parsed.url;
  bodyType.value = parsed.bodyType;
  bodyEditor.value = parsed.body;

  renderKVTable('params', parsed.params);
  renderKVTable('headers', parsed.headers);

  // 如果 body 类型不是 none，切换到 body tab
  if (parsed.body) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="body"]').classList.add('active');
    document.getElementById('tab-body').classList.add('active');
  }

  updateBodyHighlight();
}
