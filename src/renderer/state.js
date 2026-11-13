/**
 * 运行时共享状态
 */

export let currentRequest = null;
export let currentResponse = null;
export let currentView = 'history';
export let contextMenuTarget = null;
export let draggedItem = null;

export function setCurrentRequest(req) {
  currentRequest = req;
}

export function setCurrentResponse(resp) {
  currentResponse = resp;
}

export function setCurrentView(view) {
  currentView = view;
}

export function setContextMenuTarget(target) {
  contextMenuTarget = target;
}

export function setDraggedItem(item) {
  draggedItem = item;
  window.__draggedItem = item;
}
