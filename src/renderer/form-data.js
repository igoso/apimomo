/**
 * multipart/form-data 支持
 * - 字段表 UI（文本字段 / 文件字段，文件走主进程 open-file-dialog 选择，路径随请求保存）
 * - 请求体构造（boundary 编码，文件以 Buffer 读入）
 * - 原始报文预览（文件部分以 <N bytes binary> 占位）
 * 使用 window.require 兼容 Electron nodeIntegration 环境
 */
const fs = window.require('fs');
const path = window.require('path');
const { ipcRenderer } = window.require('electron');
import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

const multipartTable = document.getElementById('multipart-table');

// 常见扩展名 MIME 映射（未命中回退 application/octet-stream）
const MIME_MAP = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', html: 'text/html',
  json: 'application/json', xml: 'application/xml', zip: 'application/zip',
  gz: 'application/gzip', mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/wav',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword'
};

function mimeGuess(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

export function generateBoundary() {
  return '----ApiMomo' + Date.now().toString(16) + Math.random().toString(16).slice(2);
}

// ==================== 字段表 UI ====================

/** 渲染 value 单元格（text: 输入框；file: 只读路径 + 选择按钮） */
function renderValueCell(cell, data, row) {
  const type = row.querySelector('.mp-type').value;
  cell.innerHTML = '';
  if (type === 'file') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mp-value mp-file-path';
    input.readOnly = true;
    input.placeholder = t('multipart.noFile');
    input.value = data.value || '';
    const browse = document.createElement('button');
    browse.className = 'mp-browse';
    browse.textContent = '...';
    browse.title = t('multipart.selectFile');
    browse.addEventListener('click', async () => {
      const filePath = await ipcRenderer.invoke('open-file-dialog', {
        title: t('multipart.selectFile'),
        filters: [{ name: 'All Files', extensions: ['*'] }]
      });
      if (filePath) input.value = filePath;
    });
    cell.append(input, browse);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mp-value';
    input.placeholder = 'Value';
    input.spellcheck = false;
    input.value = data.value || '';
    cell.appendChild(input);
  }
}

export function addMultipartRow(data = {}) {
  if (!multipartTable) return;
  const row = document.createElement('div');
  row.className = 'multipart-row';
  const checked = data.enabled === false ? '' : 'checked';
  row.innerHTML = `
    <input type="checkbox" class="kv-check" ${checked}>
    <input type="text" placeholder="Key" value="${escapeHtml(data.key || '')}" class="mp-key" spellcheck="false">
    <select class="mp-type">
      <option value="text" ${data.type !== 'file' ? 'selected' : ''}>Text</option>
      <option value="file" ${data.type === 'file' ? 'selected' : ''}>File</option>
    </select>
    <div class="mp-value-cell"></div>
    <span class="kv-remove" title="Remove">
      <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>
    </span>
  `;
  const valueCell = row.querySelector('.mp-value-cell');
  renderValueCell(valueCell, data, row);
  // 类型切换时按新类型重建 value 单元格（清空原值，避免文本/路径混用）
  row.querySelector('.mp-type').addEventListener('change', () => {
    renderValueCell(valueCell, {}, row);
  });
  row.querySelector('.kv-remove').addEventListener('click', () => row.remove());
  multipartTable.appendChild(row);
}

export function renderMultipartTable(items) {
  if (!multipartTable) return;
  const head = multipartTable.querySelector('.multipart-head');
  multipartTable.innerHTML = '';
  if (head) multipartTable.appendChild(head);
  items.forEach(item => addMultipartRow(item));
  addMultipartRow();
}

/** 读取字段表（仅收 key 非空行，含未勾选行以便保存） */
export function getMultipartItems() {
  if (!multipartTable) return [];
  const items = [];
  multipartTable.querySelectorAll('.multipart-row:not(.multipart-head)').forEach(row => {
    const key = row.querySelector('.mp-key').value.trim();
    if (!key) return;
    items.push({
      key,
      type: row.querySelector('.mp-type').value === 'file' ? 'file' : 'text',
      value: row.querySelector('.mp-value')?.value || '',
      enabled: row.querySelector('.kv-check').checked
    });
  });
  return items;
}

// ==================== x-www-form-urlencoded ====================

/** 勾选的 form 字段 → urlencoded body 字符串（与 Postman 行为一致：key/value 均 URL 编码） */
export function buildUrlEncodedBody(fields) {
  return fields
    .map(f => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value ?? '')}`)
    .join('&');
}

/** 旧数据兼容：urlencoded body 字符串 → KV 字段数组（尽力解码，失败保留原文） */
export function parseUrlEncodedBody(str) {
  if (!str) return [];
  const dec = s => {
    try { return decodeURIComponent(s.replace(/\+/g, '%20')); } catch { return s; }
  };
  return str.split('&').filter(Boolean).map(pair => {
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? '' : pair.slice(eq + 1);
    return { key: dec(rawKey), value: dec(rawVal), desc: '', enabled: true };
  });
}

// ==================== 请求体构造 ====================

/**
 * 构造 multipart 请求体（Buffer）
 * @param {Array<{key,type,value}>} fields - 已过滤的启用字段
 * @returns {{ buffer: Buffer, contentType: string }}
 * @throws 文件读取失败时抛错（message 含文件路径）
 */
export function buildMultipartBody(fields) {
  const boundary = generateBoundary();
  const chunks = [];
  for (const f of fields) {
    if (f.type === 'file') {
      let buf;
      try {
        buf = fs.readFileSync(f.value);
      } catch (e) {
        throw new Error(`${t('multipart.fileReadError')}: ${f.value}`);
      }
      const filename = path.basename(f.value || 'file');
      chunks.push(
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"; filename="${filename}"\r\nContent-Type: ${mimeGuess(filename)}\r\n\r\n`),
        buf,
        Buffer.from('\r\n')
      );
    } else {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"\r\n\r\n${f.value}\r\n`));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    buffer: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

/**
 * 构造 multipart 报文的可读预览（文件部分以占位符表示，不读文件内容）
 * @returns {{ text: string, contentType: string }}
 */
export function buildMultipartPreview(fields) {
  const boundary = generateBoundary();
  const parts = [];
  for (const f of fields) {
    if (f.type === 'file') {
      const filename = path.basename(f.value || 'file');
      let size = null;
      try { size = fs.statSync(f.value).size; } catch {}
      const bodyHint = size === null
        ? `<file not found: ${f.value}>`
        : `<${size} bytes binary>`;
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"; filename="${filename}"\r\nContent-Type: ${mimeGuess(filename)}\r\n\r\n${bodyHint}\r\n`);
    } else {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${f.key}"\r\n\r\n${f.value}\r\n`);
    }
  }
  parts.push(`--${boundary}--\r\n`);
  return {
    text: parts.join(''),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}
