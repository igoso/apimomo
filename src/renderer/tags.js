/**
 * 标签管理模块
 */
import { appData, saveData } from './store.js';
import { openModal, closeModal } from './modal.js';
import { escapeHtml } from './utils.js';

const TAG_COLOR_POOL = [
  '#ff6c37', '#4caf50', '#2196f3', '#ff9800',
  '#9c27b0', '#f44336', '#00bcd4', '#795548',
  '#e91e63', '#3f51b5', '#009688', '#8bc34a',
  '#ff5722', '#673ab7', '#03a9f4', '#cddc39'
];

let currentTagTarget = null;

function getOrAssignTagColor(tagName) {
  if (!appData.tagColors) appData.tagColors = {};
  if (appData.tagColors[tagName]) return appData.tagColors[tagName];
  const used = Object.values(appData.tagColors);
  const available = TAG_COLOR_POOL.filter(c => !used.includes(c));
  const color = available.length > 0 ? available[0] : TAG_COLOR_POOL[Math.floor(Math.random() * TAG_COLOR_POOL.length)];
  appData.tagColors[tagName] = color;
  return color;
}

export function getTagColor(tagName) {
  return appData.tagColors?.[tagName] || '#666';
}

export function openTagModal(target) {
  currentTagTarget = target;
  const tagList = document.getElementById('tag-list');
  const allTags = Object.keys(appData.tagColors || {});

  let selectedTags = [];
  if (target.type === 'request') {
    const coll = appData.collections.find(c => c.id === target.collectionId);
    const req = coll?.requests.find(r => r.id === target.id);
    selectedTags = req?.tags || [];
  } else if (target.type === 'collection') {
    const coll = appData.collections.find(c => c.id === target.id);
    selectedTags = coll?.tags || [];
  }

  tagList.innerHTML = allTags.map(tag => `
    <label class="tag-checkbox-item">
      <input type="checkbox" value="${escapeHtml(tag)}" ${selectedTags.includes(tag) ? 'checked' : ''}>
      <span class="tag-color-dot" style="background:${appData.tagColors[tag]}"></span>
      <span class="tag-name">${escapeHtml(tag)}</span>
    </label>
  `).join('');

  const input = document.getElementById('new-tag-name');
  if (input) input.value = '';
  openModal('modal-tags');
}

export function addNewTag() {
  const input = document.getElementById('new-tag-name');
  const name = input?.value.trim();
  if (!name) return;

  const color = getOrAssignTagColor(name);
  const tagList = document.getElementById('tag-list');

  // 检查是否已存在
  const existing = tagList?.querySelector(`input[value="${CSS.escape(name)}"]`);
  if (existing) {
    existing.checked = true;
    input.value = '';
    return;
  }

  const label = document.createElement('label');
  label.className = 'tag-checkbox-item';
  label.innerHTML = `
    <input type="checkbox" value="${escapeHtml(name)}" checked>
    <span class="tag-color-dot" style="background:${color}"></span>
    <span class="tag-name">${escapeHtml(name)}</span>
  `;
  tagList?.appendChild(label);
  input.value = '';
}

export function saveTags() {
  if (!currentTagTarget) return;

  const checkboxes = document.querySelectorAll('#tag-list input[type="checkbox"]:checked');
  const tags = Array.from(checkboxes).map(cb => cb.value);

  if (currentTagTarget.type === 'request') {
    const coll = appData.collections.find(c => c.id === currentTagTarget.collectionId);
    const req = coll?.requests.find(r => r.id === currentTagTarget.id);
    if (req) req.tags = tags;
  } else if (currentTagTarget.type === 'collection') {
    const coll = appData.collections.find(c => c.id === currentTagTarget.id);
    if (coll) coll.tags = tags;
  }

  saveData(appData);
  closeModal('modal-tags');
  if (window.__renderSidebar) window.__renderSidebar();
}
