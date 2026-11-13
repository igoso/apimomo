/**
 * ApiMomo 渲染进程主入口
 * 负责模块组合、事件绑定与应用初始化
 */

// ==================== 基础模块 ====================
import { setCurrentView } from './renderer/state.js';
import * as dom from './renderer/dom.js';

// ==================== 功能模块 ====================
import { renderSidebar, toggleGroup, loadRequest, initDateWatcher } from './renderer/sidebar.js';
import { renderKVTable, addKVRow, getKVItems } from './renderer/kv-table.js';
import { sendRequest, showResponseTab } from './renderer/request.js';
import { importCurl, isCurlCommand, applyCurlCommand } from './renderer/curl-import.js';
import { initBodyEditor, beautifyBody } from './renderer/body-editor.js';
import { initFindBar } from './renderer/find-bar.js';
import { initTabs, openRequest, duplicateRequest, renameTab, newTab, saveCurrentTab, refreshTabDirtyState } from './renderer/tabs.js';
import { showRawRequest, buildRawRequest } from './renderer/raw-view.js';
import { addMultipartRow, getMultipartItems, buildUrlEncodedBody } from './renderer/form-data.js';
import {
  saveCollection, openSaveRequestModal, confirmSaveRequest
} from './renderer/collection.js';
import { showContextMenu, confirmMove } from './renderer/context-menu.js';
import { importPostmanCollection, confirmPostmanImport } from './renderer/postman-import.js';
import { exportCollectionPostman, exportAllCollectionsPostman } from './renderer/postman-export.js';
import { addNewTag, saveTags } from './renderer/tags.js';
import { loadSettings, saveSettings } from './renderer/settings.js';
import { openModal, closeModal, initModalBackdrop } from './renderer/modal.js';
import { initResizers } from './renderer/resizer.js';
import { t } from './renderer/i18n.js';
import { showToast } from './renderer/utils.js';

// ==================== Window 桥接（供内联 onclick 使用）====================
window.toggleGroup = toggleGroup;
window.__showContextMenu = showContextMenu;
window.__renderSidebar = renderSidebar;
window.__importPostmanCollection = importPostmanCollection;
window.__exportCollectionPostman = exportCollectionPostman;
window.__exportAllCollectionsPostman = exportAllCollectionsPostman;
// tabs.js 桥接：方法颜色同步 / 保存请求弹窗 / 复制请求 / 重命名标签（避免循环依赖）
window.__updateMethodColor = updateMethodColor;
window.__openSaveRequestModal = openSaveRequestModal;
window.__duplicateRequest = duplicateRequest;
window.__renameTab = renameTab;

// 数据文件读写失败提示（store.js 通过桥接通知，避免循环依赖）
window.__onSaveDataError = () => showToast(t('err.saveDataFailed'), 5000);
if (window.__loadDataError) showToast(t('err.loadDataFailed'), 5000);

// Method Select 颜色同步
function updateMethodColor() {
  const wrapper = document.getElementById('method-select-wrapper');
  if (wrapper) {
    wrapper.className = 'method-select-wrapper method-' + dom.methodSelect.value;
  }
}

// 加载请求后的 UI 更新回调：交给标签页模块处理（表单填充/响应恢复/dirty 基线）
window.__onLoadRequest = (req, el) => {
  openRequest(req, { type: el.dataset.type, collectionId: el.dataset.collection });
};

// ==================== 事件绑定 ====================

// 顶部操作：请求进行中点击 = 取消本次请求（由 sendRequest 内部处理）
dom.btnSend.addEventListener('click', sendRequest);
dom.btnSave.addEventListener('click', saveCurrentTab);

// 复制为 cURL
document.getElementById('btn-copy-curl')?.addEventListener('click', async () => {
  const method = dom.methodSelect.value;
  const url = dom.urlInput.value.trim();
  if (!url) {
    showToast(t('msg.pleaseEnterUrl'));
    dom.urlInput.focus();
    return;
  }

  let finalUrl = url;
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = 'http://' + finalUrl;
  }

  // 仅导出勾选中的参数（与发送行为一致）
  const params = getKVItems('params').filter(p => p.enabled);
  if (params.length > 0) {
    try {
      const urlObj = new URL(finalUrl);
      params.forEach(p => urlObj.searchParams.set(p.key, p.value));
      finalUrl = urlObj.toString();
    } catch {}
  }

  // 仅导出勾选中的请求头（与发送行为一致）
  const headers = getKVItems('headers').filter(h => h.enabled);
  const body = dom.bodyEditor.value;
  const bodyType = dom.bodyType.value;

  const escapeShell = (str) => str.replace(/'/g, "'\\''");
  const parts = [`curl -X ${method} '${escapeShell(finalUrl)}'`];

  headers.forEach(h => {
    parts.push(`  -H '${escapeShell(h.key)}: ${escapeShell(h.value)}'`);
  });

  if (bodyType === 'multipart') {
    // multipart 导出为 -F（文本字段 key=value，文件字段 key=@路径），与发送行为一致
    getMultipartItems().filter(f => f.enabled && f.key).forEach(f => {
      const v = f.type === 'file' ? `@${f.value}` : f.value;
      parts.push(`  -F '${escapeShell(f.key)}=${escapeShell(v)}'`);
    });
  } else if (bodyType === 'form') {
    // urlencoded 从字段表构造（与发送行为一致）
    const encoded = buildUrlEncodedBody(getKVItems('form').filter(f => f.enabled && f.key));
    if (encoded) parts.push(`  -d '${escapeShell(encoded)}'`);
  } else if (body && bodyType !== 'none') {
    parts.push(`  -d '${escapeShell(body)}'`);
  }

  const cmd = parts.join(' \\\n');

  try {
    // file:// 生产页面上 navigator.clipboard 不可用，改用主进程剪贴板（nodeIntegration 环境）
    const { clipboard } = window.require('electron');
    clipboard.writeText(cmd);
    const btn = document.getElementById('btn-copy-curl');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = original, 1500);
    }
  } catch (err) {
    console.error('Copy failed:', err);
  }
});

// 保存请求弹窗
document.getElementById('btn-confirm-save-req')?.addEventListener('click', confirmSaveRequest);
document.getElementById('btn-cancel-save-req')?.addEventListener('click', () => {
  if (window.__tabSaveCancelled) window.__tabSaveCancelled();
  closeModal('modal-save-request');
});
// 输入法组词中的回车（isComposing / keyCode 229）不视为「确认」操作
const isConfirmEnter = e => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;

document.getElementById('save-req-name')?.addEventListener('keydown', (e) => {
  if (isConfirmEnter(e)) confirmSaveRequest();
});

// 重命名弹窗
document.getElementById('btn-confirm-rename')?.addEventListener('click', confirmRename);
document.getElementById('btn-cancel-rename')?.addEventListener('click', () => closeModal('modal-rename'));
document.getElementById('rename-input')?.addEventListener('keydown', (e) => {
  if (isConfirmEnter(e)) confirmRename();
});
// 侧边栏图标栏：新建请求
dom.btnNewRequest?.addEventListener('click', newTab);

// 无边框窗口的自绘窗口按钮
const { ipcRenderer } = window.require('electron');
document.getElementById('win-minimize')?.addEventListener('click', () => ipcRenderer.invoke('window-minimize'));
document.getElementById('win-maximize')?.addEventListener('click', () => ipcRenderer.invoke('window-toggle-maximize'));
document.getElementById('win-close')?.addEventListener('click', () => ipcRenderer.invoke('window-close'));

// 窗口拖动：-webkit-app-region: drag 在本机不生效，改为按下拖动区并移动超过阈值后，
// 由主进程接管移动窗口；纯点击不触发（避免点击拖动区导致窗口跳动/卡顿）。
// 拖动区 = 侧边栏顶部（图标/名称/导航外的空白）+ 标签栏空白处；内部控件不参与拖动。
const DRAG_AREA = '.sidebar-header, .req-tabs-bar';
const DRAG_EXCLUDE = 'button, input, select, textarea, .req-tabs-scroll, .window-controls';
const DRAG_MOVE_THRESHOLD = 4;
let dragArmed = null;        // 按下待拖动状态 {x, y}
let windowDragging = false;

function isDragArea(target) {
  return !!(target.closest?.(DRAG_AREA) && !target.closest(DRAG_EXCLUDE));
}

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !isDragArea(e.target)) return;
  e.preventDefault();
  dragArmed = { x: e.screenX, y: e.screenY };
});

document.addEventListener('mousemove', (e) => {
  if (!dragArmed) return;
  if (Math.abs(e.screenX - dragArmed.x) + Math.abs(e.screenY - dragArmed.y) < DRAG_MOVE_THRESHOLD) return;
  dragArmed = null;
  windowDragging = true;
  ipcRenderer.send('window-drag-start');
});

function endWindowDrag() {
  dragArmed = null;
  if (!windowDragging) return;
  windowDragging = false;
  ipcRenderer.send('window-drag-end');
}
document.addEventListener('mouseup', endWindowDrag);
window.addEventListener('blur', endWindowDrag);

// 双击拖动区：最大化 / 还原（与系统标题栏行为一致）
document.addEventListener('dblclick', (e) => {
  if (isDragArea(e.target)) ipcRenderer.invoke('window-toggle-maximize');
});


dom.btnNewCollection.addEventListener('click', () => {
  const editIdInput = document.getElementById('collection-edit-id');
  if (editIdInput) editIdInput.value = '';
  dom.collectionNameInput.value = '';
  dom.collectionTagsInput.value = '';
  const titleEl = document.getElementById('collection-modal-title');
  const btnEl = document.getElementById('btn-create-collection');
  if (titleEl) titleEl.textContent = 'Create Collection';
  if (btnEl) btnEl.textContent = 'Create';
  openModal('modal-collection');
  dom.collectionNameInput?.focus();
});

// 弹窗按钮
document.getElementById('btn-create-collection').addEventListener('click', saveCollection);
document.getElementById('btn-cancel-collection').addEventListener('click', () => closeModal('modal-collection'));
// 新建/编辑合集弹窗：弹窗内任意文本框按回车即确认创建（输入法组词中的回车不触发）
document.getElementById('modal-collection')?.addEventListener('keydown', e => {
  if (isConfirmEnter(e) && e.target.tagName === 'INPUT' && e.target.type === 'text') saveCollection();
});
document.getElementById('btn-confirm-move').addEventListener('click', confirmMove);
document.getElementById('btn-cancel-move').addEventListener('click', () => closeModal('modal-move'));

// 标签管理弹窗
document.getElementById('btn-add-tag')?.addEventListener('click', addNewTag);
document.getElementById('btn-save-tags')?.addEventListener('click', saveTags);
document.getElementById('btn-cancel-tags')?.addEventListener('click', () => closeModal('modal-tags'));
document.getElementById('new-tag-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addNewTag();
});

// 搜索
dom.searchInput.addEventListener('input', renderSidebar);

// 请求面板 Tab 切换
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// 响应面板 Tab 切换
document.querySelectorAll('.resp-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.resp-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showResponseTab(btn.dataset.respTab);
  });
});

// HTTP 原始报文预览
document.getElementById('btn-raw-request')?.addEventListener('click', showRawRequest);
document.getElementById('btn-cancel-raw-request')?.addEventListener('click', () => closeModal('modal-raw-request'));
document.getElementById('btn-copy-raw-request')?.addEventListener('click', (e) => {
  try {
    // file:// 生产页面上 navigator.clipboard 不可用，改用主进程剪贴板
    const { clipboard } = window.require('electron');
    clipboard.writeText(buildRawRequest() || '');
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (err) {
    console.error('Copy failed:', err);
  }
});

// KV 表格添加行
document.querySelectorAll('.btn-add-row').forEach(btn => {
  btn.addEventListener('click', () => addKVRow(btn.dataset.target));
});

// multipart 字段表添加行
document.getElementById('btn-add-multipart')?.addEventListener('click', () => addMultipartRow());

// 侧边栏视图切换
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCurrentView(btn.dataset.view);
    renderSidebar();
  });
});

// Body 美化
dom.btnBeautify.addEventListener('click', beautifyBody);

// Method 下拉框颜色同步
dom.methodSelect.addEventListener('change', updateMethodColor);

// ==================== URL query ↔ Params 表双向同步 ====================
// 地址栏中的 query 与 Params 表互为镜像：
// - URL → Params（回车/失焦/粘贴）：query 解析进 Params 表，地址栏保留 query 不清除
// - Params → URL（表格输入/勾选/删行，防抖）：按勾选行重建地址栏 query（未勾选行仅留在表中）
// 两侧内容一致时互相同步均为空操作，避免来回覆盖
function parseUrlQuery(raw) {
  if (raw.indexOf('?') < 0) return null;
  // 协议补全规则与 sendRequest 一致
  const candidate = (raw.startsWith('http://') || raw.startsWith('https://'))
    ? raw
    : (raw.includes(':443') ? 'https://' + raw : 'http://' + raw);
  let urlObj;
  try { urlObj = new URL(candidate); } catch { return null; }
  const items = [];
  urlObj.searchParams.forEach((value, key) => {
    // 同名参数后值覆盖前值（与发送时 searchParams.set 的行为一致）
    const exist = items.find(i => i.key === key);
    if (exist) exist.value = value;
    else items.push({ key, value });
  });
  return items;
}

/** URL → Params：query 与表中勾选行不一致时以 query 重建表（desc 按 key 保留） */
function syncUrlQueryToParams() {
  const urlItems = parseUrlQuery(dom.urlInput.value.trim());
  if (!urlItems || urlItems.length === 0) return; // URL 无 query 时不动 Params 表
  const tableItems = getKVItems('params').filter(p => p.enabled);
  const same = tableItems.length === urlItems.length
    && tableItems.every((p, i) => p.key === urlItems[i].key && p.value === urlItems[i].value);
  if (same) return;
  const oldItems = getKVItems('params');
  renderKVTable('params', urlItems.map(i => ({
    ...i,
    desc: oldItems.find(o => o.key === i.key)?.desc || '',
    enabled: true
  })));
  // 程序化重建不触发 input 事件，手动刷新标签 dirty 状态
  refreshTabDirtyState();
}

/** Params → URL：按勾选行重建地址栏 query（base 与 hash 保留） */
function syncParamsToUrlQuery() {
  const raw = dom.urlInput.value.trim();
  if (!raw) return;
  const query = getKVItems('params')
    .filter(p => p.enabled)
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  const hashIdx = raw.indexOf('#');
  const hash = hashIdx >= 0 ? raw.slice(hashIdx) : '';
  const base = (hashIdx >= 0 ? raw.slice(0, hashIdx) : raw).split('?')[0];
  const next = base + (query ? '?' + query : '') + hash;
  if (next === raw) return;
  dom.urlInput.value = next;
  refreshTabDirtyState();
}

// Params 表变化（输入/勾选/删行/加行）防抖同步回地址栏
let paramsToUrlTimer = null;
function scheduleParamsToUrl() {
  clearTimeout(paramsToUrlTimer);
  paramsToUrlTimer = setTimeout(syncParamsToUrlQuery, 300);
}
document.getElementById('params-table')?.addEventListener('input', scheduleParamsToUrl);
// 删除行（row.remove）不触发 input，靠 click 冒泡捕获；勾选也走这里兜底
document.getElementById('params-table')?.addEventListener('click', e => {
  if (e.target.closest('.kv-remove') || e.target.closest('.kv-check')) scheduleParamsToUrl();
});
document.querySelector('.btn-add-row[data-target="params"]')?.addEventListener('click', scheduleParamsToUrl);

// URL 输入回车发送（发送前先把 query 参数解析进 Params 表）
dom.urlInput.addEventListener('keydown', e => {
  if (isConfirmEnter(e)) {
    syncUrlQueryToParams();
    sendRequest();
  }
});

// 失焦时解析（如点击 Send 按钮、切换到 Params 表编辑）
dom.urlInput.addEventListener('blur', syncUrlQueryToParams);

// URL 输入框粘贴检测：如果是 cURL 命令则自动解析
dom.urlInput.addEventListener('paste', e => {
  const pasted = (e.clipboardData || window.clipboardData).getData('text');
  if (isCurlCommand(pasted)) {
    e.preventDefault();
    applyCurlCommand(pasted);
    // 同步 method 颜色
    updateMethodColor();
    // 程序化填充不触发 input 事件，手动刷新标签 dirty 状态
    refreshTabDirtyState();
  } else {
    // 非 cURL：等粘贴内容写入输入框后，若 URL 带 query 则解析到 Params 表
    setTimeout(syncUrlQueryToParams, 0);
  }
});

// cURL 导入
dom.btnImport.addEventListener('click', () => {
  dom.curlInput.value = '';
  openModal('modal-import');
});
dom.btnParseCurl.addEventListener('click', () => {
  importCurl();
  updateMethodColor();
  refreshTabDirtyState();
});
dom.btnCancelImport.addEventListener('click', () => closeModal('modal-import'));

// 设置
dom.btnSettings.addEventListener('click', () => {
  loadSettings();
  openModal('modal-settings');
});
dom.btnSaveSettings.addEventListener('click', saveSettings);
dom.btnCancelSettings.addEventListener('click', () => closeModal('modal-settings'));

// Postman 导入弹窗
document.getElementById('btn-confirm-postman-import')?.addEventListener('click', confirmPostmanImport);
document.getElementById('btn-cancel-postman-import')?.addEventListener('click', () => closeModal('modal-postman-import'));
document.getElementById('postman-collection-name')?.addEventListener('keydown', e => {
  if (isConfirmEnter(e)) confirmPostmanImport();
});

// 弹窗背景点击关闭
initModalBackdrop();

// ==================== 初始化 ====================
// 先应用设置（语言/主题/代理状态图标），再渲染界面，避免语言不一致
loadSettings();
renderSidebar();
renderKVTable('params', []);
renderKVTable('headers', []);
initBodyEditor();
initFindBar();
initTabs();
updateMethodColor();
initResizers();
initDateWatcher();

// 复制响应结果
const btnCopyResponse = document.getElementById('btn-copy-response');
if (btnCopyResponse) {
  btnCopyResponse.addEventListener('click', async () => {
    const responseBody = document.getElementById('response-body');
    let text = '';

    // Headers 选项卡：key \t value 格式
    const headerRows = responseBody?.querySelectorAll('.resp-header-row');
    if (headerRows && headerRows.length > 0) {
      const lines = [];
      headerRows.forEach(row => {
        const key = row.querySelector('.resp-header-key')?.textContent || '';
        const value = row.querySelector('.resp-header-value')?.textContent || '';
        if (key && value) {
          lines.push(`${key}\t${value}`);
        }
      });
      text = lines.join('\n');
    } else {
      const codeEl = responseBody?.querySelector('code');
      text = codeEl ? codeEl.textContent : (responseBody?.textContent || '');
    }

    try {
      // 同 copy-curl：file:// 页面用主进程剪贴板
      const { clipboard } = window.require('electron');
      clipboard.writeText(text);
      const original = btnCopyResponse.textContent;
      btnCopyResponse.textContent = 'Copied!';
      setTimeout(() => btnCopyResponse.textContent = original, 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  });
}
