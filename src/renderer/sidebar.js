/**
 * 侧边栏渲染模块（History / Collections）
 */
import { appData, saveData } from './store.js';
import { currentRequest, currentView } from './state.js';
import { sidebarContent, searchInput } from './dom.js';
import { escapeHtml, truncateUrl, groupByDate, getDateKey } from './utils.js';
import { getTagColor } from './tags.js';

// ==================== 历史记录多选 ====================

// Shift/Ctrl 点击选中的记录 id 集合
const selectedHistoryIds = new Set();
// Shift 范围选择的锚点 id（普通/Ctrl 点击时更新）
let selectionAnchorId = null;

/** 获取当前选中的历史记录 id 列表 */
export function getSelectedHistoryIds() {
  return [...selectedHistoryIds];
}

/** 清空历史多选状态并同步 DOM */
export function clearHistorySelection() {
  selectedHistoryIds.clear();
  selectionAnchorId = null;
  updateSelectionClasses();
}

function updateSelectionClasses() {
  document.querySelectorAll('.api-item[data-type="history"]').forEach(el => {
    el.classList.toggle('selected', selectedHistoryIds.has(el.dataset.id));
  });
}

/** Ctrl/Cmd 点击：切换单项选中 */
function toggleHistorySelection(id) {
  if (selectedHistoryIds.has(id)) {
    selectedHistoryIds.delete(id);
  } else {
    selectedHistoryIds.add(id);
  }
  selectionAnchorId = id;
  updateSelectionClasses();
}

/** Shift 点击：选中锚点到目标项之间的连续范围 */
function selectHistoryRange(targetId) {
  const items = [...document.querySelectorAll('.api-item[data-type="history"]')];
  const targetIdx = items.findIndex(el => el.dataset.id === targetId);
  if (targetIdx < 0) return;

  let anchorIdx = selectionAnchorId ? items.findIndex(el => el.dataset.id === selectionAnchorId) : -1;
  if (anchorIdx < 0) {
    anchorIdx = targetIdx;
    selectionAnchorId = targetId;
  }

  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);
  selectedHistoryIds.clear();
  for (let i = start; i <= end; i++) {
    selectedHistoryIds.add(items[i].dataset.id);
  }
  updateSelectionClasses();
}


export function renderSidebar() {
  if (currentView !== 'history') {
    // 离开历史视图时清空多选状态
    selectedHistoryIds.clear();
    selectionAnchorId = null;
  } else {
    // 清理已被删除的选中项
    const validIds = new Set(appData.history.map(h => h.id));
    [...selectedHistoryIds].forEach(id => {
      if (!validIds.has(id)) selectedHistoryIds.delete(id);
    });
  }

  sidebarContent.innerHTML = '';
  const filter = searchInput.value.toLowerCase();

  if (currentView === 'history') {
    renderHistory(filter);
  } else {
    renderCollections(filter);
  }
}

/**
 * 跨天自动刷新：应用常驻时检测日历日期变化，
 * 变化后重渲染侧边栏，保证"今天/昨天"分组标签始终正确
 */
export function initDateWatcher() {
  let lastDateKey = new Date().toDateString();

  const check = () => {
    const dateKey = new Date().toDateString();
    if (dateKey === lastDateKey) return;
    lastDateKey = dateKey;
    if (currentView === 'history') renderSidebar();
  };

  // 精确调度到次日零点后检查
  const scheduleNextMidnight = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    setTimeout(() => {
      check();
      scheduleNextMidnight();
    }, nextMidnight.getTime() - now.getTime() + 1000);
  };
  scheduleNextMidnight();

  // 兜底：窗口重新获得焦点 / 恢复可见时检查（覆盖系统休眠等定时器延迟场景）
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
}

/**
 * 历史条目的展示标题：合集里已保存的请求显示它的名称。
 * 按 requestId 在合集中实时取，请求被重命名后历史里也是新名称。
 */
function historyTitle(item) {
  if (item.requestId) {
    for (const coll of appData.collections || []) {
      const req = coll.requests?.find(r => r.id === item.requestId);
      if (req?.name) return req.name;
    }
  }
  return item.name || '';
}

function renderHistory(filter) {
  const grouped = groupByDate(appData.history);
  for (const [date, items] of Object.entries(grouped)) {
    const rows = filter
      ? items.filter(i => `${historyTitle(i)} ${i.url}`.toLowerCase().includes(filter))
      : items;
    if (rows.length === 0) continue;

    const dateKey = getDateKey(items[0].timestamp);
    const collapsed = collapsedHistoryDates.has(dateKey);
    const group = document.createElement('div');
    group.className = 'collection-group';
    group.innerHTML = `
      <div class="collection-header ${collapsed ? 'collapsed' : ''}" data-type="history-group" data-date-key="${dateKey}" onclick="toggleGroup(this)">
        <span class="collection-toggle"><svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg></span>
        <span class="collection-name">${date}</span>
      </div>
      <div class="collection-items" ${collapsed ? 'style="display:none"' : ''}>
        ${rows.map(item => {
          const title = historyTitle(item);
          return `
          <div class="api-item ${currentRequest?.id === item.id ? 'active' : ''} ${selectedHistoryIds.has(item.id) ? 'selected' : ''}" data-id="${item.id}" data-type="history" draggable="true">
            <span class="api-method method-${item.method}">${item.method}</span>
            <span class="api-url" title="${escapeHtml(title ? `${title} · ${item.url}` : item.url)}">${escapeHtml(title || truncateUrl(item.url))}</span>
          </div>
        `;
        }).join('')}
      </div>
    `;
    sidebarContent.appendChild(group);
  }
  attachItemEvents();
}

// 已折叠的合集 id / 历史日期分组 key：折叠状态只存 DOM 会在重绘（如点击请求刷新高亮）后丢失，记在内存中保持
const collapsedCollectionIds = new Set();
const collapsedHistoryDates = new Set();

function renderCollections(filter) {
  appData.collections.forEach(coll => {
    const filtered = filter ? coll.requests?.filter(r => r.name?.toLowerCase().includes(filter) || r.url?.toLowerCase().includes(filter)) : coll.requests;
    if (filter && (!filtered || filtered.length === 0)) return;

    const collapsed = collapsedCollectionIds.has(coll.id);
    const group = document.createElement('div');
    group.className = 'collection-group';
    group.innerHTML = `
      <div class="collection-header ${collapsed ? 'collapsed' : ''}" data-type="collection" data-collection-id="${coll.id}" onclick="toggleGroup(this)">
        <span class="collection-toggle"><svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg></span>
        <span class="collection-name">${escapeHtml(coll.name)}</span>
        <div class="collection-actions">
          <span class="action-icon" title="Add request" onclick="event.stopPropagation();addRequestToCollection('${coll.id}')">
            <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6 2v8M2 6h8"/></svg>
          </span>
          <span class="action-icon" title="Edit" onclick="event.stopPropagation();editCollection('${coll.id}')">
            <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.4 1.8l1.8 1.8-6 6-2.4.6.6-2.4z"/></svg>
          </span>
          <span class="action-icon" title="Delete" onclick="event.stopPropagation();deleteCollection('${coll.id}')">
            <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>
          </span>
        </div>
      </div>
      <div class="collection-items" ${collapsed ? 'style="display:none"' : ''}>
        ${(filtered || []).map(req => `
          <div class="api-item ${currentRequest?.id === req.id ? 'active' : ''}" data-id="${req.id}" data-collection="${coll.id}" data-type="request" draggable="true">
            <span class="api-method method-${req.method}">${req.method}</span>
            <span class="api-url" title="${escapeHtml(req.url)}">${escapeHtml(req.name || truncateUrl(req.url))}</span>
            <div class="api-tags">${(req.tags || []).map(t => `<span class="api-tag" style="background:${getTagColor(t)}">${escapeHtml(t)}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    `;
    sidebarContent.appendChild(group);
  });
  attachItemEvents();
}

export function toggleGroup(header) {
  const items = header.nextElementSibling;
  const willCollapse = items.style.display !== 'none';
  items.style.display = willCollapse ? 'none' : '';
  header.classList.toggle('collapsed', willCollapse);
  // 折叠状态同步到内存（合集按 id、历史按日期分组 key），重绘后恢复
  const collId = header.dataset.collectionId;
  const dateKey = header.dataset.dateKey;
  const store = collId ? collapsedCollectionIds : (dateKey ? collapsedHistoryDates : null);
  const key = collId || dateKey;
  if (store && key) {
    if (willCollapse) store.add(key);
    else store.delete(key);
  }
}

function attachItemEvents() {
  document.querySelectorAll('.api-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Shift 点击：范围多选；Ctrl/Cmd 点击：切换单项选中（仅历史记录）
      if (item.dataset.type === 'history' && e.shiftKey) {
        selectHistoryRange(item.dataset.id);
        return;
      }
      if (item.dataset.type === 'history' && (e.ctrlKey || e.metaKey)) {
        toggleHistorySelection(item.dataset.id);
        return;
      }

      clearHistorySelection();
      if (item.dataset.type === 'history') selectionAnchorId = item.dataset.id;
      loadRequest(item);
    });
    item.addEventListener('contextmenu', e => {
      if (window.__showContextMenu) window.__showContextMenu(e, item);
    });
    item.addEventListener('dragstart', e => {
      window.__draggedItem = { id: item.dataset.id, collection: item.dataset.collection, type: item.dataset.type };
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  // 历史日期分组头右键菜单（可删除该天全部记录）
  document.querySelectorAll('.collection-header[data-type="history-group"]').forEach(header => {
    header.addEventListener('contextmenu', e => {
      if (window.__showContextMenu) window.__showContextMenu(e, header);
    });
  });

  // 合集头右键菜单（导出该合集为 Postman 格式）
  document.querySelectorAll('.collection-header[data-type="collection"]').forEach(header => {
    header.addEventListener('contextmenu', e => {
      if (window.__showContextMenu) window.__showContextMenu(e, header);
    });
  });

  document.querySelectorAll('.collection-group').forEach(group => {
    group.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    group.addEventListener('drop', e => {
      e.preventDefault();
      if (window.__draggedItem && currentView === 'collections') {
        const header = group.querySelector('.collection-header');
        const collectionId = appData.collections.find(c => c.name === header.querySelector('.collection-name').textContent)?.id;
        if (collectionId && window.__draggedItem.collection !== collectionId) {
          moveRequest(window.__draggedItem.id, window.__draggedItem.collection, collectionId);
        }
      }
    });
  });
}

// 合集视图空白处右键：弹出导入菜单（不在条目/分组头上时）
sidebarContent.addEventListener('contextmenu', e => {
  if (currentView !== 'collections') return;
  if (e.target.closest('.api-item') || e.target.closest('.collection-header')) return;
  e.preventDefault();
  if (window.__showContextMenu) window.__showContextMenu(e, { dataset: { type: 'collections-blank' } });
});

// 通过 window 桥接加载请求后的 UI 更新
window.__onLoadRequest = null;
export function loadRequest(el) {
  const id = el.dataset.id;
  const type = el.dataset.type;
  let req;
  if (type === 'history') {
    req = appData.history.find(h => h.id === id);
  } else {
    const coll = appData.collections.find(c => c.id === el.dataset.collection);
    req = coll?.requests?.find(r => r.id === id);
  }
  if (!req) return;

  // 通过回调通知主模块更新 UI
  if (window.__onLoadRequest) {
    window.__onLoadRequest(req, el);
  }
}

export function moveRequest(reqId, fromCollId, toCollId) {
  const fromColl = appData.collections.find(c => c.id === fromCollId);
  const toColl = appData.collections.find(c => c.id === toCollId);
  if (!fromColl || !toColl) return;
  const req = fromColl.requests.find(r => r.id === reqId);
  if (!req) return;
  fromColl.requests = fromColl.requests.filter(r => r.id !== reqId);
  toColl.requests.push(req);
  saveData(appData);
  renderSidebar();
}
