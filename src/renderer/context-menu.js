/**
 * 右键菜单模块
 */
import { appData, saveData } from './store.js';
import { moveTargetSelect, modalMove } from './dom.js';
import { escapeHtml, showToast, getDateKey } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { openTagModal } from './tags.js';
import { t } from './i18n.js';
import { getSelectedHistoryIds, clearHistorySelection } from './sidebar.js';

export function showContextMenu(e, item) {
  e.preventDefault();
  window.__contextMenuTarget = item;
  removeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  const type = item.dataset.type;
  if (type === 'request') {
    menu.innerHTML = `
      <div class="context-menu-item" onclick="duplicateContextRequest()">${t('ctx.duplicate')}</div>
      <div class="context-menu-item" onclick="renameRequest()">${t('ctx.rename')}</div>
      <div class="context-menu-item" onclick="tagRequest()">${t('ctx.addTag')}</div>
      <div class="context-menu-item" onclick="openMoveModal()">${t('ctx.moveTo')}</div>
      <div class="context-menu-item" onclick="deleteRequest()" style="color:#f44336">${t('ctx.delete')}</div>
    `;
  } else if (type === 'history') {
    const selectedIds = getSelectedHistoryIds();
    const isSelected = selectedIds.includes(item.dataset.id);
    // 右键未选中的项时，取消已有选择
    if (!isSelected) clearHistorySelection();

    // 右键选中项且多选生效时，提供批量删除
    const multiSelect = isSelected && selectedIds.length > 1;
    const deleteItem = multiSelect
      ? `<div class="context-menu-item" onclick="deleteSelectedHistory()" style="color:#f44336">${t('ctx.deleteSelected')} (${selectedIds.length})</div>`
      : `<div class="context-menu-item" onclick="deleteHistory()" style="color:#f44336">${t('ctx.delete')}</div>`;
    menu.innerHTML = `
      <div class="context-menu-item" onclick="duplicateContextRequest()">${t('ctx.duplicate')}</div>
      <div class="context-menu-item" onclick="saveHistoryToCollection()">${t('ctx.saveToCollection')}</div>
      ${deleteItem}
    `;
  } else if (type === 'history-group') {
    const dateKey = item.dataset.dateKey;
    const count = appData.history.filter(h => getDateKey(h.timestamp) === dateKey).length;
    menu.innerHTML = `
      <div class="context-menu-item" onclick="deleteHistoryGroup()" style="color:#f44336">${t('ctx.deleteGroup')} (${count})</div>
    `;
  } else if (type === 'collection') {
    // 合集头右键：导出该合集为 Postman collection
    menu.innerHTML = `
      <div class="context-menu-item" onclick="__exportCollectionPostman('${item.dataset.collectionId}')">${t('ctx.exportPostman')}</div>
    `;
  } else if (type === 'collections-blank') {
    // 合集视图空白处右键：从 Postman 备份导入 / 导出全部接口
    menu.innerHTML = `
      <div class="context-menu-item" onclick="__importPostmanCollection()">${t('ctx.importPostman')}</div>
      <div class="context-menu-item" onclick="__exportAllCollectionsPostman()">${t('ctx.exportAllPostman')}</div>
    `;
  }

  document.body.appendChild(menu);
}

export function removeContextMenu() {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
}

// 任意 mousedown 落在右键菜单外部时立即关闭（含 tabs.js 的标签右键菜单，同类名）。
// 用捕获阶段：此前挂在 click 冒泡上，若下一次点击的组件（如地址栏代理按钮）stopPropagation，
// 菜单会一直残留并盖住界面，吞掉后续点击
document.addEventListener('mousedown', e => {
  if (e.target.closest?.('.context-menu')) return;
  removeContextMenu();
}, true);

// 通过 window 暴露，供内联 onclick 调用
window.duplicateContextRequest = function duplicateContextRequest() {
  removeContextMenu();
  const item = window.__contextMenuTarget;
  if (!item) return;

  let req;
  if (item.dataset.type === 'history') {
    req = appData.history.find(h => h.id === item.dataset.id);
  } else {
    const coll = appData.collections.find(c => c.id === item.dataset.collection);
    req = coll?.requests?.find(r => r.id === item.dataset.id);
  }
  if (!req) return;
  if (window.__duplicateRequest) window.__duplicateRequest(req);
};

window.renameRequest = function renameRequest() {
  removeContextMenu();
  const item = window.__contextMenuTarget;
  if (!item) return;
  const id = item.dataset.id;
  const coll = appData.collections.find(c => c.id === item.dataset.collection);
  const req = coll?.requests.find(r => r.id === id);
  if (!req) return;

  const urlDisplay = document.getElementById('rename-url-display');
  const nameInput = document.getElementById('rename-input');
  if (urlDisplay) urlDisplay.textContent = req.url;
  if (nameInput) {
    nameInput.value = req.name || '';
    setTimeout(() => nameInput.focus(), 100);
  }

  window.__renameTarget = { req, coll };
  openModal('modal-rename');
};

window.confirmRename = function confirmRename() {
  const nameInput = document.getElementById('rename-input');
  const name = nameInput?.value.trim();
  const target = window.__renameTarget;
  if (!target) return;

  if (target.tab) {
    // 标签重命名：由 tabs.js 更新标题（已保存请求同步集合中的名称）
    if (window.__renameTab) window.__renameTab(target.tab.tabId, name);
  } else {
    target.req.name = name;
    saveData(appData);
    if (window.__renderSidebar) window.__renderSidebar();
  }
  closeModal('modal-rename');
};

window.tagRequest = function tagRequest() {
  removeContextMenu();
  const item = window.__contextMenuTarget;
  if (!item) return;
  openTagModal({
    type: 'request',
    id: item.dataset.id,
    collectionId: item.dataset.collection
  });
};

window.openMoveModal = function openMoveModal() {
  removeContextMenu();
  const item = window.__contextMenuTarget;
  if (!item) return;
  window.__moveAction = 'move';
  const titleEl = document.getElementById('move-modal-title');
  const btnEl = document.getElementById('btn-confirm-move');
  const msgEl = document.getElementById('save-success-msg');
  if (titleEl) titleEl.textContent = t('modal.moveToCollection');
  if (btnEl) btnEl.textContent = t('modal.move');
  if (msgEl) msgEl.textContent = '';
  moveTargetSelect.innerHTML = appData.collections
    .filter(c => c.id !== item.dataset.collection)
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
  modalMove.classList.add('active');
};

export function confirmMove() {
  const targetId = moveTargetSelect.value;
  const item = window.__contextMenuTarget;
  if (!item || !targetId) {
    closeModal('modal-move');
    return;
  }

  if (window.__moveAction === 'save') {
    const id = item.dataset.id;
    const hist = appData.history.find(h => h.id === id);
    if (hist) {
      const coll = appData.collections.find(c => c.id === targetId);
      if (coll) {
        coll.requests.push({
          id: 'r-' + Date.now(),
          name: hist.url,
          method: hist.method,
          url: hist.url,
          params: hist.params,
          headers: hist.headers,
          body: hist.body,
          bodyType: hist.bodyType,
          tags: []
        });
        saveData(appData);
        const msgEl = document.getElementById('save-success-msg');
        if (msgEl) msgEl.textContent = t('msg.savedToCollection');
        setTimeout(() => closeModal('modal-move'), 1200);
        return;
      }
    }
  } else {
    moveRequest(item.dataset.id, item.dataset.collection, targetId);
  }

  closeModal('modal-move');
}

function moveRequest(reqId, fromCollId, toCollId) {
  const fromColl = appData.collections.find(c => c.id === fromCollId);
  const toColl = appData.collections.find(c => c.id === toCollId);
  if (!fromColl || !toColl) return;
  const req = fromColl.requests.find(r => r.id === reqId);
  if (!req) return;
  fromColl.requests = fromColl.requests.filter(r => r.id !== reqId);
  toColl.requests.push(req);
  saveData(appData);
  if (window.__renderSidebar) window.__renderSidebar();
}

window.deleteRequest = function deleteRequest() {
  removeContextMenu();
  const item = window.__contextMenuTarget;
  if (!item) return;
  const id = item.dataset.id;
  const coll = appData.collections.find(c => c.id === item.dataset.collection);
  if (coll) {
    coll.requests = coll.requests.filter(r => r.id !== id);
    saveData(appData);
    if (window.__renderSidebar) window.__renderSidebar();
  }
};

window.saveHistoryToCollection = function saveHistoryToCollection() {
  removeContextMenu();
  const item = window.__contextMenuTarget;
  if (!item) return;
  if (appData.collections.length === 0) {
    showToast(t('msg.createCollectionFirst'));
    return;
  }
  window.__moveAction = 'save';
  const titleEl = document.getElementById('move-modal-title');
  const btnEl = document.getElementById('btn-confirm-move');
  const msgEl = document.getElementById('save-success-msg');
  if (titleEl) titleEl.textContent = t('modal.saveToCollection');
  if (btnEl) btnEl.textContent = t('modal.save');
  if (msgEl) msgEl.textContent = '';
  moveTargetSelect.innerHTML = appData.collections
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
  modalMove.classList.add('active');
};

window.deleteHistory = function deleteHistory() {
  removeContextMenu();
  const item = window.__contextMenuTarget;
  if (!item) return;
  const id = item.dataset.id;
  appData.history = appData.history.filter(h => h.id !== id);
  saveData(appData);
  clearHistorySelection();
  if (window.__renderSidebar) window.__renderSidebar();
};

window.deleteSelectedHistory = function deleteSelectedHistory() {
  removeContextMenu();
  const ids = getSelectedHistoryIds();
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  appData.history = appData.history.filter(h => !idSet.has(h.id));
  saveData(appData);
  clearHistorySelection();
  if (window.__renderSidebar) window.__renderSidebar();
};

window.deleteHistoryGroup = function deleteHistoryGroup() {
  removeContextMenu();
  const item = window.__contextMenuTarget;
  if (!item) return;
  const dateKey = item.dataset.dateKey;
  if (!dateKey) return;
  appData.history = appData.history.filter(h => getDateKey(h.timestamp) !== dateKey);
  saveData(appData);
  if (window.__renderSidebar) window.__renderSidebar();
};

window.__contextMenuTarget = null;
