/**
 * HTTP 原始请求报文预览
 * 按与 sendRequest 完全一致的规则（协议补全、勾选 params/headers、Content-Type 推导）
 * 构造实际发送的报文文本，展示在弹窗中
 */
import { methodSelect, urlInput, bodyEditor, bodyType } from './dom.js';
import { getKVItems } from './kv-table.js';
import { getMultipartItems, buildMultipartPreview, buildUrlEncodedBody } from './form-data.js';
import { showToast } from './utils.js';
import { openModal } from './modal.js';
import { t } from './i18n.js';

/** 构造原始报文文本；URL 无效时返回 null */
export function buildRawRequest() {
  const url = urlInput.value.trim();
  if (!url) return null;

  // 协议补全规则与 request.js sendRequest 一致
  let finalUrl;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    finalUrl = url;
  } else if (url.includes(':443')) {
    finalUrl = 'https://' + url;
  } else {
    finalUrl = 'http://' + url;
  }

  // 仅勾选的参数参与请求（与发送行为一致）
  const params = getKVItems('params').filter(p => p.enabled);
  let u;
  try {
    u = new URL(finalUrl);
    params.forEach(p => u.searchParams.set(p.key, p.value));
  } catch {
    return null;
  }

  // 仅勾选的请求头参与请求；Content-Type 按 bodyType 推导（与发送一致）
  const headers = getKVItems('headers').filter(h => h.enabled);
  let body = bodyEditor.value;
  const bType = bodyType.value;
  const reqHeaders = {};
  headers.forEach(h => { reqHeaders[h.key] = h.value; });
  if (bType === 'multipart') {
    // multipart：预览用 boundary 结构，文件部分以占位符表示（与发送构造同一套规则）
    const fields = getMultipartItems().filter(f => f.enabled && f.key);
    const preview = buildMultipartPreview(fields);
    reqHeaders['Content-Type'] = preview.contentType;
    const lines = [];
    lines.push(`${methodSelect.value} ${u.pathname}${u.search} HTTP/1.1`);
    lines.push(`Host: ${u.host}`);
    Object.entries(reqHeaders).forEach(([k, v]) => lines.push(`${k}: ${v}`));
    lines.push('');
    lines.push(preview.text);
    return lines.join('\n');
  } else if (bType === 'form') {
    const formFields = getKVItems('form').filter(f => f.enabled && f.key);
    const encoded = buildUrlEncodedBody(formFields);
    if (encoded) {
      reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      body = encoded;
    }
  } else if (bType === 'json' && body) {
    reqHeaders['Content-Type'] = 'application/json';
  } else if (bType === 'text' && body) {
    reqHeaders['Content-Type'] = 'text/plain';
  }

  const lines = [];
  lines.push(`${methodSelect.value} ${u.pathname}${u.search} HTTP/1.1`);
  lines.push(`Host: ${u.host}`);
  Object.entries(reqHeaders).forEach(([k, v]) => lines.push(`${k}: ${v}`));
  lines.push('');
  if (bType !== 'none' && body) lines.push(body);
  return lines.join('\n');
}

/** 入口：校验并弹窗展示当前请求的原始报文 */
export function showRawRequest() {
  if (!urlInput.value.trim()) {
    showToast(t('msg.pleaseEnterUrl'));
    urlInput.focus();
    return;
  }
  const raw = buildRawRequest();
  if (raw === null) {
    showToast(t('msg.invalidUrl'));
    return;
  }
  document.getElementById('raw-request-view').textContent = raw;
  openModal('modal-raw-request');
}
