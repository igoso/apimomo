/**
 * 集合（Collection）管理模块
 */
import { appData, saveData } from './store.js';
import {
  methodSelect, urlInput, bodyEditor, bodyType,
  collectionNameInput, collectionTagsInput
} from './dom.js';
import { renderSidebar } from './sidebar.js';
import { closeModal, openModal } from './modal.js';
import { escapeHtml } from './utils.js';
import { getKVItems } from './kv-table.js';
import { getMultipartItems } from './form-data.js';
import { currentRequest } from './state.js';
import { t } from './i18n.js';
import { showToast } from './utils.js';

export function saveCollection() {
  const editId = document.getElementById('collection-edit-id')?.value;
  const name = collectionNameInput.value.trim();
  if (!name) return;
  const tags = collectionTagsInput.value.split(',').map(t => t.trim()).filter(t => t);

  if (editId) {
    const coll = appData.collections.find(c => c.id === editId);
    if (coll) {
      coll.name = name;
      coll.tags = tags;
    }
  } else {
    appData.collections.push({
      id: 'c-' + Date.now(),
      name,
      tags,
      requests: []
    });
  }

  saveData(appData);
  closeModal('modal-collection');
  renderSidebar();
}

export function editCollection(id) {
  const coll = appData.collections.find(c => c.id === id);
  if (!coll) return;

  const editIdInput = document.getElementById('collection-edit-id');
  if (editIdInput) editIdInput.value = id;
  collectionNameInput.value = coll.name || '';
  collectionTagsInput.value = (coll.tags || []).join(', ');

  const titleEl = document.getElementById('collection-modal-title');
  const btnEl = document.getElementById('btn-create-collection');
  if (titleEl) titleEl.textContent = 'Edit Collection';
  if (btnEl) btnEl.textContent = 'Save';

  openModal('modal-collection');
  collectionNameInput.focus();
}

export function deleteCollection(id) {
  if (!confirm(t('msg.deleteCollectionConfirm'))) return;
  appData.collections = appData.collections.filter(c => c.id !== id);
  saveData(appData);
  renderSidebar();
}

export function addRequestToCollection(collectionId) {
  const coll = appData.collections.find(c => c.id === collectionId);
  if (!coll) return;
  const req = {
    id: 'r-' + Date.now(),
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: '',
    bodyType: 'none',
    tags: []
  };
  coll.requests.push(req);
  saveData(appData);
  renderSidebar();
}

export function openSaveRequestModal() {
  const url = urlInput.value.trim();
  if (!url) {
    showToast(t('msg.pleaseEnterUrl'));
    urlInput.focus();
    return;
  }
  if (appData.collections.length === 0) {
    showToast(t('msg.createCollectionFirst'));
    return;
  }

  const nameInput = document.getElementById('save-req-name');
  const collSelect = document.getElementById('save-req-collection');
  const successEl = document.getElementById('save-req-success');
  if (successEl) successEl.textContent = '';

  // 默认名称和集合
  let defaultName = currentRequest?.name || url;
  let defaultCollId = appData.collections[0]?.id;

  // 如果当前请求已存在于某集合，默认选中
  if (currentRequest?.id) {
    for (const coll of appData.collections) {
      const req = coll.requests.find(r => r.id === currentRequest.id);
      if (req) {
        defaultName = req.name || url;
        defaultCollId = coll.id;
        break;
      }
    }
  }

  if (nameInput) nameInput.value = defaultName;
  if (collSelect) {
    collSelect.innerHTML = appData.collections
      .map(c => `<option value="${c.id}" ${c.id === defaultCollId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
      .join('');
  }

  openModal('modal-save-request');
}

export function confirmSaveRequest() {
  const nameInput = document.getElementById('save-req-name');
  const collSelect = document.getElementById('save-req-collection');
  const successEl = document.getElementById('save-req-success');

  const name = nameInput?.value.trim();
  const collId = collSelect?.value;
  if (!name || !collId) return;

  const coll = appData.collections.find(c => c.id === collId);
  if (!coll) return;

  const method = methodSelect.value;
  const url = urlInput.value.trim();
  const params = getKVItems('params');
  const headers = getKVItems('headers');
  const body = bodyEditor.value;
  const bType = bodyType.value;
  const multipart = bType === 'multipart' ? getMultipartItems() : undefined;
  const form = bType === 'form' ? getKVItems('form') : undefined;

  // 更新或新建
  const existingIdx = currentRequest?.id
    ? coll.requests.findIndex(r => r.id === currentRequest.id)
    : -1;

  let savedId;
  if (existingIdx >= 0) {
    coll.requests[existingIdx] = {
      ...coll.requests[existingIdx],
      name, method, url, params, headers, body, bodyType: bType,
      ...(multipart ? { multipart } : {}),
      ...(form ? { form } : {})
    };
    savedId = coll.requests[existingIdx].id;
  } else {
    const newReq = {
      id: 'r-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      name, method, url, params, headers, body, bodyType: bType,
      tags: [...(currentRequest?.tags || [])],
      ...(multipart ? { multipart } : {}),
      ...(form ? { form } : {})
    };
    coll.requests.push(newReq);
    savedId = newReq.id;
  }

  saveData(appData);
  if (successEl) successEl.textContent = existingIdx >= 0 ? t('msg.updated') : t('msg.saved');
  setTimeout(() => closeModal('modal-save-request'), 1000);
  renderSidebar();

  // 通知标签页模块更新当前标签（requestId/dirty 基线/标题）
  if (window.__onTabSaved) {
    window.__onTabSaved({ requestId: savedId, collectionId: collId, name });
  }
}

// 供 sidebar 内联 onclick 调用
window.editCollection = editCollection;
window.deleteCollection = deleteCollection;
window.addRequestToCollection = addRequestToCollection;
