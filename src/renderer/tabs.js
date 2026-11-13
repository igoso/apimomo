/**
 * 请求标签页模块（Postman 风格）
 * - 每个标签独立保存一份表单快照（method/url/params/headers/body/bodyType）与响应
 * - dirty 检测：表单与基线（加载/保存时）不一致时，标签与地址栏显示 * 号
 * - Ctrl+S：已保存的请求直接更新到所在集合；新请求（含历史打开的）走"保存请求"弹窗选择集合
 * - 关闭未保存标签时弹确认：保存 / 不保存 / 取消
 */
import { appData, saveData, SESSION_FILE } from './store.js';
import { currentResponse, setCurrentResponse, setCurrentRequest } from './state.js';
import {
  methodSelect, urlInput, bodyEditor, bodyType,
  responseStatus, responseTime, responseSize, responseBody
} from './dom.js';
import { renderKVTable, getKVItems } from './kv-table.js';
import { getMultipartItems, renderMultipartTable, parseUrlEncodedBody } from './form-data.js';
import { renderSidebar } from './sidebar.js';
import { displayResponse } from './request.js';
import { updateBodyHighlight } from './body-editor.js';
import { t } from './i18n.js';
import { showToast, truncateUrl, escapeHtml } from './utils.js';
import { openModal, closeModal } from './modal.js';

// ==================== 状态 ====================

const tabs = [];          // { tabId, key, requestId, collectionId, title, method, snapshot, baselineKey, dirty, response, reqData }
let activeTabId = null;
let pendingCloseTabId = null; // 关闭确认中等待保存后关闭的标签
let tabSeq = 0;
let restoring = false;    // 表单恢复期间抑制 dirty 检测

const reqTabsEl = document.getElementById('req-tabs');
const reqTabAddBtn = document.getElementById('req-tab-add');
const dirtyStar = document.getElementById('dirty-star');

function activeTab() {
  return tabs.find(tb => tb.tabId === activeTabId) || null;
}

/** 同步共享的 currentRequest 与当前标签关联的请求（发送时据此识别「合集中已保存的请求」） */
function syncCurrentRequest(tab) {
  setCurrentRequest(tab?.reqData ? { ...tab.reqData, ...(tab.snapshot || {}) } : null);
}

// ==================== 表单快照与 dirty 检测 ====================

function collectForm() {
  return {
    method: methodSelect.value,
    url: urlInput.value,
    params: getKVItems('params'),
    headers: getKVItems('headers'),
    body: bodyEditor.value,
    bodyType: bodyType.value,
    multipart: getMultipartItems(),
    form: getKVItems('form')
  };
}

function formKey(form) {
  return JSON.stringify(form);
}

function computeTitle(tab) {
  if (tab.reqData?.name) return tab.reqData.name;
  const url = tab.snapshot?.url || '';
  return url ? truncateUrl(url) : t('tabs.newRequest');
}

/** 深拷贝请求数据，避免副本与原请求共享引用 */
function cloneFormData(req) {
  return JSON.parse(JSON.stringify({
    method: req.method || 'GET',
    url: req.url || '',
    params: req.params || [],
    headers: req.headers || [],
    body: req.body || '',
    bodyType: req.bodyType || 'none',
    multipart: req.multipart || [],
    form: req.form || []
  }));
}

/** 表单变化后重算 dirty；标题随 URL 联动（供 cURL 导入等程序化填充后调用） */
export function refreshTabDirtyState() {
  const tab = activeTab();
  if (!tab || restoring) return;
  tab.snapshot = collectForm();
  tab.method = tab.snapshot.method;
  tab.dirty = formKey(tab.snapshot) !== tab.baselineKey;
  if (!tab.reqData?.name) tab.title = computeTitle(tab);
  renderTabs();
  updateDirtyStar();
}

function updateDirtyStar() {
  const tab = activeTab();
  if (dirtyStar) dirtyStar.hidden = !(tab && tab.dirty);
}

function restoreForm(snap) {
  methodSelect.value = snap.method || 'GET';
  urlInput.value = snap.url || '';
  bodyType.value = snap.bodyType || 'none';
  bodyEditor.value = snap.body || '';
  updateBodyHighlight();
  renderKVTable('params', snap.params || []);
  renderKVTable('headers', snap.headers || []);
  renderMultipartTable(snap.multipart || []);
  // form 字段：新数据用字段数组；旧数据（body 存 urlencoded 字符串）解析回 KV 行
  renderKVTable('form', snap.form?.length ? snap.form : parseUrlEncodedBody(snap.body || ''));
  if (window.__updateMethodColor) window.__updateMethodColor();
}

function clearResponseArea() {
  responseStatus.textContent = '---';
  responseStatus.className = 'response-status';
  responseTime.textContent = '';
  responseSize.textContent = '';
  responseBody.innerHTML = `
    <div class="response-empty">
      <svg class="response-empty-icon" viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="6" y="9" width="36" height="30" rx="4"/>
        <path d="M6 17h36"/>
        <path d="M14 25h12M14 31h18"/>
      </svg>
      <p class="response-empty-title" data-i18n="res.emptyTitle">${escapeHtml(t('res.emptyTitle'))}</p>
      <p class="response-empty-hint" data-i18n="res.clickSend">${escapeHtml(t('res.clickSend'))}</p>
    </div>`;
}

// ==================== 标签生命周期 ====================

function nextTabId() {
  return 'tab-' + (++tabSeq) + '-' + Date.now();
}

function snapshotActive() {
  const tab = activeTab();
  if (!tab) return;
  tab.snapshot = collectForm();
  tab.response = currentResponse;
  tab.method = tab.snapshot.method;
  if (!tab.reqData?.name) tab.title = computeTitle(tab);
}

function applyTab(tab) {
  restoring = true;
  activeTabId = tab.tabId;
  restoreForm(tab.snapshot || collectForm());
  // 基线以恢复后的 DOM 读取为准（renderKVTable → getKVItems 有归一化行为）
  if (tab.baselineKey === undefined) tab.baselineKey = formKey(collectForm());
  tab.snapshot = collectForm();
  tab.method = tab.snapshot.method;
  tab.dirty = formKey(tab.snapshot) !== tab.baselineKey;

  // 已保存请求与历史记录都带 reqData，用于侧边栏 active 高亮与保存时 id 匹配
  syncCurrentRequest(tab);

  if (tab.response) {
    setCurrentResponse(tab.response);
    displayResponse();
  } else {
    setCurrentResponse(null);
    clearResponseArea();
  }
  restoring = false;
  renderTabs();
  scrollActiveTabIntoView();
  updateDirtyStar();
  renderSidebar();
}

/** 将激活标签滚动到标签栏可视区域内（打开/复制/切换标签后定位） */
function scrollActiveTabIntoView() {
  const tabEl = reqTabsEl.querySelector('.req-tab.active');
  const scroller = reqTabsEl.parentElement;
  if (!tabEl || !scroller) return;

  const tabRect = tabEl.getBoundingClientRect();
  const viewRect = scroller.getBoundingClientRect();
  if (tabRect.left < viewRect.left) {
    scroller.scrollLeft -= viewRect.left - tabRect.left;
  } else if (tabRect.right > viewRect.right) {
    scroller.scrollLeft += tabRect.right - viewRect.right;
  }
}

/** 新建空标签；当前已是干净的空标签时仅聚焦地址栏 */
export function newTab() {
  const cur = activeTab();
  if (cur && !cur.key && !cur.dirty && !urlInput.value.trim() && !bodyEditor.value) {
    urlInput.focus();
    return;
  }
  snapshotActive();
  const tab = {
    tabId: nextTabId(),
    key: null,
    requestId: null,
    collectionId: null,
    title: t('tabs.newRequest'),
    method: 'GET',
    snapshot: { method: 'GET', url: '', params: [], headers: [], body: '', bodyType: 'none' },
    dirty: false,
    response: null,
    reqData: null
  };
  tab.baselineKey = formKey(tab.snapshot);
  tabs.push(tab);
  applyTab(tab);
  urlInput.focus();
}

/**
 * 打开请求（侧边栏集合请求 / 历史记录）
 * 已打开的标签直接激活，否则新建标签
 */
export function openRequest(req, opts = {}) {
  const type = opts.type || 'request';
  const key = (type === 'history' ? 'h:' : 'r:') + req.id;
  const existing = tabs.find(tb => tb.key === key);
  if (existing) {
    if (existing.tabId !== activeTabId) {
      snapshotActive();
      applyTab(existing);
    }
    return;
  }

  snapshotActive();
  const tab = {
    tabId: nextTabId(),
    key,
    requestId: type === 'request' ? req.id : null,
    collectionId: type === 'request' ? (opts.collectionId || null) : null,
    title: '',
    method: req.method || 'GET',
    snapshot: {
      method: req.method || 'GET',
      url: req.url || '',
      params: req.params || [],
      headers: req.headers || [],
      body: req.body || '',
      bodyType: req.bodyType || 'none',
      multipart: req.multipart || [],
      form: req.form || []
    },
    dirty: false,
    response: null,
    reqData: { ...req }
  };
  if (req.responseBody !== undefined) {
    tab.response = {
      status: req.status,
      statusText: '',
      headers: req.responseHeaders || {},
      body: req.responseBody,
      duration: req.duration,
      size: req.size,
      url: req.url,
      proxyUrl: req.proxyUrl
    };
  }
  tab.baselineKey = undefined; // applyTab 内以归一化后的表单建立基线
  tabs.push(tab);
  applyTab(tab);
}

/**
 * 复制请求：以副本形式在独立标签中打开
 * - 不关联原请求 id，保存时走"另存为"流程，不会覆盖原请求
 * - 标签上展示"副本"标记，便于基于已有请求改参数调试
 */
export function duplicateRequest(req) {
  snapshotActive();
  const snapshot = cloneFormData(req);
  const title = req.name || (snapshot.url ? truncateUrl(snapshot.url) : t('tabs.newRequest'));
  const tab = {
    tabId: nextTabId(),
    key: null,
    requestId: null,
    collectionId: null,
    title,
    method: snapshot.method,
    snapshot,
    dirty: false,
    isCopy: true,
    response: null,
    // 仅携带名称与标签用于保存弹窗默认值，不带 id
    reqData: { ...(req.name ? { name: req.name } : {}), tags: [...(req.tags || [])] }
  };
  tab.baselineKey = undefined; // applyTab 内以归一化后的表单建立基线
  tabs.push(tab);
  applyTab(tab);
}

/** 复制指定标签（含未保存的修改）为副本标签 */
export function duplicateTab(tabId) {
  const src = tabs.find(tb => tb.tabId === tabId);
  if (!src) return;
  if (src.tabId === activeTabId) snapshotActive();
  duplicateRequest({
    ...(src.snapshot || {}),
    name: src.reqData?.name,
    tags: src.reqData?.tags || []
  });
}

/** 重命名标签：已保存请求同步集合中的名称，未保存/副本仅改标签标题 */
export function renameTab(tabId, name) {
  const tab = tabs.find(tb => tb.tabId === tabId);
  if (!tab || !name) return;

  if (tab.requestId && tab.collectionId) {
    const coll = appData.collections.find(c => c.id === tab.collectionId);
    const req = coll?.requests?.find(r => r.id === tab.requestId);
    if (req) {
      req.name = name;
      saveData(appData);
    }
  }

  tab.reqData = { ...(tab.reqData || {}), name };
  tab.title = name;
  renderTabs();
  renderSidebar();
}

/** 打开标签重命名弹窗（复用请求重命名弹窗） */
function openTabRenameModal(tabId) {
  const tab = tabs.find(tb => tb.tabId === tabId);
  if (!tab) return;
  if (tab.tabId === activeTabId) snapshotActive();

  const urlDisplay = document.getElementById('rename-url-display');
  const nameInput = document.getElementById('rename-input');
  if (urlDisplay) urlDisplay.textContent = tab.snapshot?.url || '';
  if (nameInput) {
    nameInput.value = tab.title || '';
    setTimeout(() => nameInput.focus(), 100);
  }

  window.__renameTarget = { tab };
  openModal('modal-rename');
}

/** 标签右键菜单：重命名 / 复制 */
function showTabContextMenu(e, tabId) {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.innerHTML = `
    <div class="context-menu-item" data-action="rename">${t('ctx.rename')}</div>
    <div class="context-menu-item" data-action="duplicate">${t('ctx.duplicate')}</div>
  `;
  menu.addEventListener('click', ev => {
    const item = ev.target.closest('.context-menu-item');
    if (!item) return;
    menu.remove();
    if (item.dataset.action === 'rename') openTabRenameModal(tabId);
    else if (item.dataset.action === 'duplicate') duplicateTab(tabId);
  });

  document.body.appendChild(menu);
  // 外部点击关闭由 context-menu.js 的全局 mousedown 捕获监听统一处理（同类名 .context-menu）
}

function doCloseTab(tabId) {
  const idx = tabs.findIndex(tb => tb.tabId === tabId);
  if (idx < 0) return;
  tabs.splice(idx, 1);

  if (activeTabId === tabId) {
    activeTabId = null;
    const next = tabs[idx] || tabs[idx - 1];
    if (next) {
      applyTab(next);
    } else if (tabs.length === 0) {
      // 最后一个标签关闭后自动开新空标签
      newTab();
      return;
    }
  }
  renderTabs();
  updateDirtyStar();
}

/** 关闭标签入口：dirty 时先弹确认 */
function requestCloseTab(tabId) {
  const tab = tabs.find(tb => tb.tabId === tabId);
  if (!tab) return;
  if (tab.dirty && tab.tabId === activeTabId) {
    pendingCloseTabId = tabId;
    openModal('modal-close-tab');
    return;
  }
  doCloseTab(tabId);
}

// ==================== 保存 ====================

/**
 * Ctrl+S / Save 按钮入口
 * - 已保存在集合中的请求：直接更新，toast 提示
 * - 新请求 / 历史打开的：走"保存请求"弹窗（选集合、命名）
 */
export function saveCurrentTab() {
  const tab = activeTab();
  if (!tab) return;

  if (tab.requestId && tab.collectionId) {
    const coll = appData.collections.find(c => c.id === tab.collectionId);
    const req = coll?.requests.find(r => r.id === tab.requestId);
    if (req) {
      const form = collectForm();
      Object.assign(req, {
        method: form.method,
        url: form.url.trim(),
        params: form.params,
        headers: form.headers,
        body: form.body,
        bodyType: form.bodyType,
        ...(form.bodyType === 'multipart' ? { multipart: form.multipart } : {}),
        ...(form.bodyType === 'form' ? { form: form.form } : {})
      });
      saveData(appData);
      tab.baselineKey = formKey(collectForm());
      tab.snapshot = collectForm();
      tab.method = form.method;
      tab.dirty = false;
      tab.reqData = { ...(tab.reqData || {}), ...form, id: req.id, name: req.name };
      tab.title = req.name || tab.title;
      syncCurrentRequest(tab);
      renderTabs();
      renderSidebar();
      showToast(t('msg.updated'));
      if (pendingCloseTabId === tab.tabId) {
        pendingCloseTabId = null;
        doCloseTab(tab.tabId);
      }
      return;
    }
    // 所在集合/请求已被删除，退回弹窗流程
  }

  if (!urlInput.value.trim()) {
    showToast(t('msg.pleaseEnterUrl'));
    urlInput.focus();
    pendingCloseTabId = null;
    return;
  }
  if (window.__openSaveRequestModal) window.__openSaveRequestModal();
}

/** collection.js 保存成功后回调（window 桥接，避免循环依赖） */
function onRequestSaved({ requestId, collectionId, name }) {
  const tab = activeTab();
  if (!tab) return;
  const form = collectForm();
  tab.requestId = requestId;
  tab.collectionId = collectionId;
  tab.key = 'r:' + requestId;
  tab.reqData = { ...(tab.reqData || {}), ...form, id: requestId, name };
  tab.baselineKey = formKey(form);
  tab.snapshot = form;
  tab.method = form.method;
  tab.dirty = false;
  tab.isCopy = false;
  tab.title = name || tab.title;
  syncCurrentRequest(tab);
  renderTabs();
  renderSidebar();
  if (pendingCloseTabId === tab.tabId) {
    pendingCloseTabId = null;
    doCloseTab(tab.tabId);
  }
}

/** 保存弹窗被取消时清除挂起的关闭动作 */
function onTabSaveCancelled() {
  pendingCloseTabId = null;
}

// ==================== 标签栏渲染 ====================

function renderTabs() {
  if (!reqTabsEl) return;
  const scroller = reqTabsEl.parentElement;
  const scrollLeft = scroller ? scroller.scrollLeft : 0;
  reqTabsEl.innerHTML = tabs.map(tb => `
    <div class="req-tab ${tb.tabId === activeTabId ? 'active' : ''} ${tb.dirty ? 'dirty' : ''}"
         data-tab-id="${tb.tabId}" draggable="true"
         title="${escapeHtml(tb.dirty ? '* ' + tb.title : tb.title)}">
      <span class="req-tab-method method-${tb.method}">${tb.method}</span>
      <span class="req-tab-title">${escapeHtml(tb.title)}</span>
      ${tb.isCopy ? `<span class="req-tab-copy">${escapeHtml(t('tabs.copyBadge'))}</span>` : ''}
      <span class="req-tab-close" title="${escapeHtml(t('tabs.close'))}">
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>
      </span>
    </div>
  `).join('');
  // 重建标签 DOM 后恢复滚动位置，避免输入/刷新时标签栏跳回最左侧
  if (scroller) scroller.scrollLeft = scrollLeft;
  scheduleSessionSave();
}

// ==================== 会话暂存（退出时保存标签与未保存修改） ====================

let sessionSaveTimer = null;

/** 序列化当前标签会话（含每个标签的表单快照与 dirty 基线） */
function serializeSession() {
  // 激活标签的表单可能未入快照，序列化前补拍
  snapshotActive();
  return {
    version: 1,
    activeTabId,
    tabs: tabs.map(tb => ({
      tabId: tb.tabId,
      key: tb.key,
      requestId: tb.requestId,
      collectionId: tb.collectionId,
      title: tb.title,
      method: tb.method,
      snapshot: tb.snapshot,
      baselineKey: tb.baselineKey,
      // 媒体响应内容不随会话保留（临时文件路径在重启后失效），恢复后提示重新发送；
      // 超大文本响应体同样不保留，避免会话文件膨胀拖慢保存
      response: !tb.response ? tb.response
        : tb.response.media
          ? { ...tb.response, body: '', media: { ...tb.response.media, mediaFile: null } }
          : (typeof tb.response.body === 'string' && tb.response.body.length > 1024 * 1024
              ? { ...tb.response, body: '' }
              : tb.response),
      // reqData 携带的历史响应体同样设 1MB 上限（历史大响应体曾把会话文件撑到近百 MB，拖慢每次保存）
      reqData: (tb.reqData && typeof tb.reqData.responseBody === 'string' && tb.reqData.responseBody.length > 1024 * 1024)
        ? { ...tb.reqData, responseBody: '' }
        : tb.reqData,
      isCopy: !!tb.isCopy
    }))
  };
}

/** 同步写盘（beforeunload 兜底路径必须同步，确保退出前完成） */
function writeSessionSync() {
  if (!SESSION_FILE) return;
  try {
    const fs = window.require('fs');
    fs.writeFileSync(SESSION_FILE, JSON.stringify(serializeSession()), 'utf-8');
  } catch (e) {
    console.error('Save session error:', e);
  }
}

/** 变更后防抖落盘（正常运行期间的增量保存） */
function scheduleSessionSave() {
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(writeSessionSync, 800);
}

/** 读取上次会话；结构非法或不存在返回 null */
function readSession() {
  if (!SESSION_FILE) return null;
  try {
    const fs = window.require('fs');
    if (!fs.existsSync(SESSION_FILE)) return null;
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    if (session?.version !== 1 || !Array.isArray(session.tabs) || session.tabs.length === 0) return null;
    return session;
  } catch (e) {
    console.error('Load session error:', e);
    return null;
  }
}

/** 恢复已保存请求标签的元信息（集合中可能已改名/移动集合/被删除） */
function refreshSavedTabMeta(tab) {
  if (!tab.requestId) return;
  for (const coll of appData.collections) {
    const req = coll.requests?.find(r => r.id === tab.requestId);
    if (req) {
      tab.collectionId = coll.id;
      tab.reqData = { ...tab.reqData, ...req };
      tab.title = req.name || tab.title;
      return;
    }
  }
  // 请求已被删除：保留内容，保存时走"另存"弹窗流程
}

/** 恢复上次会话；成功返回 true */
function restoreSession() {
  const session = readSession();
  if (!session) return false;

  for (const st of session.tabs) {
    if (!st || !st.snapshot) continue;
    const tab = {
      tabId: st.tabId,
      key: st.key || null,
      requestId: st.requestId || null,
      collectionId: st.collectionId || null,
      title: st.title || t('tabs.newRequest'),
      method: st.method || st.snapshot.method || 'GET',
      snapshot: st.snapshot,
      baselineKey: st.baselineKey,
      response: st.response || null,
      reqData: st.reqData || null,
      isCopy: !!st.isCopy
    };
    tab.dirty = tab.baselineKey !== undefined && formKey(tab.snapshot) !== tab.baselineKey;
    refreshSavedTabMeta(tab);
    tabs.push(tab);
  }
  if (tabs.length === 0) return false;

  activeTabId = tabs.some(tb => tb.tabId === session.activeTabId)
    ? session.activeTabId
    : tabs[0].tabId;
  return true;
}

// ==================== 标签拖动排序 ====================

let dragTabId = null;

function clearDragMarkers() {
  reqTabsEl.querySelectorAll('.req-tab.drag-before, .req-tab.drag-after').forEach(el => {
    el.classList.remove('drag-before', 'drag-after');
  });
}

function initTabDragging() {
  reqTabsEl.addEventListener('dragstart', (e) => {
    const tabEl = e.target.closest('.req-tab');
    if (!tabEl) return;
    dragTabId = tabEl.dataset.tabId;
    tabEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragTabId);
  });

  reqTabsEl.addEventListener('dragover', (e) => {
    if (!dragTabId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDragMarkers();
    const tabEl = e.target.closest('.req-tab');
    if (!tabEl || tabEl.dataset.tabId === dragTabId) return;
    const rect = tabEl.getBoundingClientRect();
    tabEl.classList.add(e.clientX < rect.left + rect.width / 2 ? 'drag-before' : 'drag-after');
  });

  reqTabsEl.addEventListener('drop', (e) => {
    if (!dragTabId) return;
    e.preventDefault();
    const tabEl = e.target.closest('.req-tab');
    if (tabEl && tabEl.dataset.tabId !== dragTabId) {
      const fromIdx = tabs.findIndex(tb => tb.tabId === dragTabId);
      if (fromIdx >= 0) {
        const [moved] = tabs.splice(fromIdx, 1);
        const rect = tabEl.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        let insertIdx = tabs.findIndex(tb => tb.tabId === tabEl.dataset.tabId);
        if (!before) insertIdx++;
        tabs.splice(insertIdx, 0, moved);
        renderTabs();
      }
    }
    dragTabId = null;
    clearDragMarkers();
  });

  reqTabsEl.addEventListener('dragend', () => {
    dragTabId = null;
    clearDragMarkers();
    reqTabsEl.querySelectorAll('.req-tab.dragging').forEach(el => el.classList.remove('dragging'));
  });
}

// ==================== 初始化 ====================

export function initTabs() {
  if (!reqTabsEl) return;

  // 标签栏事件委托
  reqTabsEl.addEventListener('click', (e) => {
    const closeEl = e.target.closest('.req-tab-close');
    if (closeEl) {
      const tabEl = closeEl.closest('.req-tab');
      if (tabEl) requestCloseTab(tabEl.dataset.tabId);
      return;
    }
    const tabEl = e.target.closest('.req-tab');
    if (tabEl && tabEl.dataset.tabId !== activeTabId) {
      snapshotActive();
      applyTab(tabs.find(tb => tb.tabId === tabEl.dataset.tabId));
    }
  });
  reqTabAddBtn?.addEventListener('click', newTab);

  // 标签右键菜单：重命名 / 复制
  reqTabsEl.addEventListener('contextmenu', (e) => {
    const tabEl = e.target.closest('.req-tab');
    if (!tabEl) return;
    e.preventDefault();
    showTabContextMenu(e, tabEl.dataset.tabId);
  });

  // 标签拖动排序
  initTabDragging();

  // 关闭确认弹窗
  document.getElementById('btn-closetab-cancel')?.addEventListener('click', () => {
    pendingCloseTabId = null;
    closeModal('modal-close-tab');
  });
  document.getElementById('btn-closetab-discard')?.addEventListener('click', () => {
    const id = pendingCloseTabId;
    pendingCloseTabId = null;
    closeModal('modal-close-tab');
    if (id) doCloseTab(id);
  });
  document.getElementById('btn-closetab-save')?.addEventListener('click', () => {
    closeModal('modal-close-tab');
    saveCurrentTab();
  });

  // Ctrl/Cmd+S 保存当前标签
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveCurrentTab();
    }
  });

  // 表单变化 → dirty 检测
  // 请求面板内委托：input 覆盖文本/复选框，click 覆盖增删行与 Beautify
  const requestPanel = document.getElementById('request-panel');
  if (requestPanel) {
    requestPanel.addEventListener('input', refreshTabDirtyState);
    requestPanel.addEventListener('change', refreshTabDirtyState);
    requestPanel.addEventListener('click', () => setTimeout(refreshTabDirtyState, 0));
  }
  urlInput.addEventListener('input', refreshTabDirtyState);
  methodSelect.addEventListener('change', refreshTabDirtyState);

  // 桥接：collection.js 保存成功 / 取消保存时通知
  window.__onTabSaved = onRequestSaved;
  window.__tabSaveCancelled = onTabSaveCancelled;

  // 退出/刷新前同步写盘，暂存当前标签与未保存修改
  window.addEventListener('beforeunload', writeSessionSync);

  // 优先恢复上次会话，失败则开一个空标签
  if (restoreSession()) {
    tabSeq = tabs.length;
    applyTab(tabs.find(tb => tb.tabId === activeTabId));
  } else {
    const tab = {
      tabId: nextTabId(),
      key: null,
      requestId: null,
      collectionId: null,
      title: t('tabs.newRequest'),
      method: 'GET',
      snapshot: collectForm(),
      dirty: false,
      response: null,
      reqData: null
    };
    tab.baselineKey = formKey(tab.snapshot);
    tabs.push(tab);
    activeTabId = tab.tabId;
    renderTabs();
  }
  updateDirtyStar();
}
