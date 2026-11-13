/**
 * Postman Collection v2.1 导出模块
 * 将 ApiMomo 合集（或全部合集）导出为 Postman 可再导入的 collection JSON 文件
 */
import { appData } from './store.js';
import { t } from './i18n.js';
import { showToast } from './utils.js';
import { parseUrlEncodedBody } from './form-data.js';

const fs = window.require('fs');
const { ipcRenderer } = window.require('electron');

const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

/**
 * ApiMomo 请求 → Postman item（v2.1 的 request 结构）
 * 与 postman-import.js 的转换互为逆操作，保证导出的文件可再导入还原
 */
function requestToPostmanItem(req) {
  const request = {
    method: req.method || 'GET',
    header: (req.headers || []).map(h => ({
      key: h.key,
      value: h.value || '',
      ...(h.desc ? { description: h.desc } : {}),
      ...(h.enabled === false ? { disabled: true } : {})
    }))
  };

  // url：raw 完整地址 + query 参数数组；有参数时以参数为准重建 raw 的 query 部分，避免与原 URL 上的参数重复
  const query = (req.params || []).map(p => ({
    key: p.key,
    value: p.value || '',
    ...(p.desc ? { description: p.desc } : {}),
    ...(p.enabled === false ? { disabled: true } : {})
  }));
  let raw = req.url || '';
  if (query.some(q => !q.disabled)) {
    const base = raw.split('?')[0];
    const qs = query.filter(q => !q.disabled)
      .map(q => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value)}`)
      .join('&');
    raw = qs ? `${base}?${qs}` : base;
  }
  request.url = { raw, ...(query.length ? { query } : {}) };

  // body 按类型映射：json/text → raw；form → urlencoded；multipart → formdata
  const bodyType = req.bodyType || 'none';
  if (bodyType === 'json' || bodyType === 'text') {
    request.body = {
      mode: 'raw',
      raw: req.body || '',
      options: { raw: { language: bodyType } }
    };
  } else if (bodyType === 'form') {
    const fields = (req.form?.length ? req.form : parseUrlEncodedBody(req.body || ''))
      .map(f => ({
        key: f.key,
        value: f.value || '',
        ...(f.enabled === false ? { disabled: true } : {})
      }));
    request.body = { mode: 'urlencoded', urlencoded: fields };
  } else if (bodyType === 'multipart') {
    const fields = (req.multipart || []).map(f => ({
      key: f.key,
      type: f.type === 'file' ? 'file' : 'text',
      ...(f.type === 'file' ? { src: f.value || '' } : { value: f.value || '' }),
      ...(f.enabled === false ? { disabled: true } : {})
    }));
    request.body = { mode: 'formdata', formdata: fields };
  }

  return { name: req.name || req.url || 'request', request };
}

/** 组装 Postman collection v2.1 对象（items 为请求项或合集文件夹） */
function buildPostmanCollection(name, items) {
  return {
    info: {
      name,
      _postman_id: 'apimomo-' + Date.now(),
      schema: POSTMAN_SCHEMA,
      // 导出来源标记：ApiMomo 版本，便于追溯
      _apimomo_version: __APP_VERSION__
    },
    item: items
  };
}

/** 本地时间戳 yyyyMMddHHmmss（用于导出文件名） */
function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 文件名安全化（去掉 Windows 非法字符） */
function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

async function exportToFile(defaultName, data) {
  const filePath = await ipcRenderer.invoke('save-file-dialog', {
    defaultPath: safeFileName(defaultName),
    filters: [{ name: 'Postman Collection', extensions: ['json'] }]
  });
  if (!filePath) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    showToast(t('msg.exported'));
  } catch {
    showToast(t('msg.exportFailed'));
  }
}

/** 导出单个合集：请求平铺为 collection 顶层 item */
export async function exportCollectionPostman(collId) {
  const coll = appData.collections.find(c => c.id === collId);
  if (!coll) return;
  const data = buildPostmanCollection(coll.name, (coll.requests || []).map(requestToPostmanItem));
  await exportToFile(`${coll.name}_${timestamp()}.postman_collection.json`, data);
}

/** 导出全部合集：每个 ApiMomo 合集作为一个文件夹 */
export async function exportAllCollectionsPostman() {
  if (appData.collections.length === 0) {
    showToast(t('msg.createCollectionFirst'));
    return;
  }
  const items = appData.collections.map(coll => ({
    name: coll.name,
    item: (coll.requests || []).map(requestToPostmanItem)
  }));
  const data = buildPostmanCollection('ApiMomo', items);
  await exportToFile(`ApiMomo_${timestamp()}.postman_collection.json`, data);
}
