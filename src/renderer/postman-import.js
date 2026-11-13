/**
 * Postman Collection 备份导入模块
 * 支持从 Postman 导出的 collection v2.1 JSON 文件导入请求为合集
 */
import { appData, saveData } from './store.js';
import { openModal, closeModal } from './modal.js';
import { t } from './i18n.js';
import { showToast } from './utils.js';

const fs = window.require('fs');
const path = window.require('path');
const { ipcRenderer } = window.require('electron');

// 待导入的请求列表（选完文件后暂存，确认弹窗后落地）
let pendingRequests = null;
let pendingDefaultName = '';
// 多合集模式：顶层文件夹逐个恢复为独立合集（对应「导出全部接口」的文件结构）
let pendingGroups = null;

/**
 * Postman 请求头数组 → ApiMomo headers
 * 保留勾选状态（Postman disabled 字段取反映射到 enabled）
 */
function convertHeaders(headerList) {
  if (!Array.isArray(headerList)) return [];
  return headerList
    .filter(h => h.key)
    .map(h => ({
      key: h.key,
      value: h.value || '',
      desc: h.description || '',
      enabled: !h.disabled
    }));
}

/**
 * Postman url 对象/字符串 + query 数组 → ApiMomo url + params
 */
function convertUrl(url) {
  if (typeof url === 'string') return { url, params: [] };
  if (!url || typeof url !== 'object') return { url: '', params: [] };
  const raw = url.raw || '';
  let params = [];
  if (Array.isArray(url.query)) {
    params = url.query
      .filter(q => q.key)
      .map(q => ({
        key: q.key,
        value: q.value || '',
        desc: q.description || '',
        enabled: !q.disabled
      }));
  }
  return { url: raw, params };
}

/**
 * Postman body → ApiMomo { body, bodyType }
 * raw：按 options.raw.language 判定 json / text
 * urlencoded：拼接为 k=v&k2=v2 字符串（App 的 form 类型为整段文本）
 * formdata / graphql / file / none：降级处理
 */
function convertBody(body) {
  if (!body || !body.mode || body.mode === 'none') return { body: '', bodyType: 'none' };

  if (body.mode === 'raw') {
    const raw = body.raw || '';
    if (!raw) return { body: '', bodyType: 'none' };
    const language = body.options?.raw?.language;
    return { body: raw, bodyType: language === 'json' ? 'json' : 'text' };
  }

  if (body.mode === 'urlencoded' && Array.isArray(body.urlencoded)) {
    const pairs = body.urlencoded
      .filter(f => f.key)
      .map(f => `${f.key}=${f.value || ''}`);
    return { body: pairs.join('&'), bodyType: 'form' };
  }

  if (body.mode === 'graphql' && body.graphql) {
    return { body: body.graphql.query || '', bodyType: 'text' };
  }

  if (body.mode === 'formdata' && Array.isArray(body.formdata)) {
    // multipart 表单无法用文本编辑器完整表达，降级为可读文本
    const pairs = body.formdata
      .filter(f => f.key)
      .map(f => `${f.key}=${f.value || f.src || ''}`);
    return { body: pairs.join('\n'), bodyType: 'text' };
  }

  return { body: '', bodyType: 'none' };
}

/**
 * 递归展开 Postman item 树（文件夹平铺，请求名加"文件夹 / "前缀）
 */
function flattenItems(items, prefix, out) {
  if (!Array.isArray(items)) return;
  items.forEach(entry => {
    if (!entry) return;
    if (entry.request) {
      const req = entry.request || {};
      const { url, params } = convertUrl(req.url);
      const { body, bodyType } = convertBody(req.body);
      out.push({
        id: 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        name: (prefix ? prefix + ' / ' : '') + (entry.name || url || 'request'),
        method: req.method || 'GET',
        url,
        params,
        headers: convertHeaders(req.header),
        body,
        bodyType,
        tags: []
      });
    } else if (Array.isArray(entry.item)) {
      // 文件夹：递归展开
      flattenItems(entry.item, prefix ? `${prefix} / ${entry.name || ''}` : (entry.name || ''), out);
    }
  });
}

/**
 * 解析 Postman collection 文件并打开确认弹窗（合集名默认为文件名）
 * @param {string} filePath - Postman collection JSON 文件路径
 */
export function importPostmanCollectionFromFile(filePath) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    showToast(t('msg.postmanReadFailed'));
    return;
  }

  // 校验 Postman collection 结构（v2.x：顶层含 info + item 数组）
  if (!data || !Array.isArray(data.item)) {
    showToast(t('msg.postmanInvalid'));
    return;
  }

  // 顶层结构分类：文件夹（item 数组）与散请求（request 对象）
  const topFolders = [];
  const topRequests = [];
  data.item.forEach(entry => {
    if (!entry) return;
    if (entry.request) topRequests.push(entry);
    else if (Array.isArray(entry.item)) topFolders.push(entry);
  });

  const nameInput = document.getElementById('postman-collection-name');
  const hintEl = document.getElementById('postman-import-hint');

  // 多合集模式：顶层只有文件夹（「导出全部接口」的结构）→ 每个文件夹恢复为独立合集，保留原分组
  if (topFolders.length > 0 && topRequests.length === 0) {
    const groups = [];
    let total = 0;
    for (const folder of topFolders) {
      const reqs = [];
      flattenItems(folder.item, '', reqs);
      if (reqs.length > 0) {
        groups.push({ name: folder.name || 'Collection', requests: reqs });
        total += reqs.length;
      }
    }
    if (groups.length === 0) {
      showToast(t('msg.postmanEmpty'));
      return;
    }
    pendingRequests = null;
    pendingDefaultName = '';
    pendingGroups = groups;
    if (nameInput) nameInput.hidden = true;
    if (hintEl) hintEl.textContent = t('modal.postmanMultiHint').replace('{n}', groups.length).replace('{m}', total);
    openModal('modal-postman-import');
    return;
  }

  // 单合集模式：全部平铺到一个合集（文件夹名加"文件夹 / "前缀）
  const requests = [];
  flattenItems(data.item, '', requests);
  if (requests.length === 0) {
    showToast(t('msg.postmanEmpty'));
    return;
  }

  // 默认合集名 = 文件名（去 .json 扩展名；Postman 导出约定的 .postman_collection 后缀一并去掉）
  let defaultName = path.basename(filePath, path.extname(filePath));
  if (defaultName.toLowerCase().endsWith('.postman_collection')) {
    defaultName = defaultName.slice(0, -'.postman_collection'.length);
  }
  pendingRequests = requests;
  pendingDefaultName = defaultName || 'Imported Collection';
  pendingGroups = null;

  if (nameInput) {
    nameInput.hidden = false;
    nameInput.value = pendingDefaultName;
  }
  if (hintEl) hintEl.textContent = t('modal.postmanHint').replace('{n}', requests.length);
  openModal('modal-postman-import');
  if (nameInput) setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 100);
}

/**
 * 入口：打开文件选择对话框后导入
 */
export async function importPostmanCollection() {
  const filePath = await ipcRenderer.invoke('open-file-dialog', {
    filters: [{ name: 'Postman Collection', extensions: ['json'] }]
  });
  if (!filePath) return;
  importPostmanCollectionFromFile(filePath);
}

/**
 * 确认导入：多合集模式逐文件夹恢复原分组，单合集模式按弹窗确认的合集名创建
 */
export function confirmPostmanImport() {
  // 多合集模式：每个顶层文件夹恢复为独立合集（保留原分组）
  if (pendingGroups) {
    let seq = 0;
    for (const g of pendingGroups) {
      appData.collections.push({
        id: 'c-' + Date.now() + '-' + (++seq) + '-' + Math.random().toString(36).slice(2, 6),
        name: g.name,
        tags: [],
        requests: g.requests
      });
    }
    saveData(appData);

    pendingGroups = null;
    closeModal('modal-postman-import');
    showToast(t('msg.imported'));
    document.querySelector('.nav-btn[data-view="collections"]')?.click();
    return;
  }

  if (!pendingRequests) {
    closeModal('modal-postman-import');
    return;
  }
  const nameInput = document.getElementById('postman-collection-name');
  const name = (nameInput?.value || '').trim() || pendingDefaultName;

  appData.collections.push({
    id: 'c-' + Date.now(),
    name,
    tags: [],
    requests: pendingRequests
  });
  saveData(appData);

  pendingRequests = null;
  pendingDefaultName = '';
  closeModal('modal-postman-import');
  showToast(t('msg.imported'));

  // 切到集合并刷新侧边栏（nav 点击内部会 setCurrentView + renderSidebar）
  document.querySelector('.nav-btn[data-view="collections"]')?.click();
}
