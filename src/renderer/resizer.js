/**
 * 可拖拽分割线模块
 * 拖拽结果持久化到 appData.layout，重启后恢复
 */
import { appData, saveData } from './store.js';

export function initResizers() {
  initResizer('resizer-sidebar', 'sidebar', 200, 0.4, 'sidebarWidth');
  initResizer('resizer-panels', 'request-panel', 300, 0.7, 'panelWidth');
}

function initResizer(resizerId, leftPanelId, minWidth, maxWidthRatio, layoutKey) {
  const resizer = document.getElementById(resizerId);
  const leftPanel = document.getElementById(leftPanelId);

  if (!resizer || !leftPanel) return;

  // 恢复上次拖拽的宽度；上限按当前窗口比例再收一次，避免小窗口溢出
  const saved = appData.layout?.[layoutKey];
  if (typeof saved === 'number' && saved >= minWidth) {
    const containerWidth = leftPanel.parentElement.getBoundingClientRect().width;
    const width = Math.min(saved, containerWidth * maxWidthRatio);
    leftPanel.style.flex = `0 0 ${width}px`;
  }

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    resizer.classList.add('dragging');

    const startX = e.clientX;
    const startWidth = leftPanel.getBoundingClientRect().width;
    const containerWidth = leftPanel.parentElement.getBoundingClientRect().width;
    const maxWidth = containerWidth * maxWidthRatio;

    function onMouseMove(e) {
      const delta = e.clientX - startX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      leftPanel.style.flex = `0 0 ${newWidth}px`;
    }

    function onMouseUp() {
      document.body.style.cursor = '';
      resizer.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // 拖拽结束后写入数据文件，下次启动恢复
      appData.layout = { ...appData.layout, [layoutKey]: Math.round(leftPanel.getBoundingClientRect().width) };
      saveData(appData);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
