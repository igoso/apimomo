/**
 * 弹窗控制
 */

export function openModal(id) {
  document.getElementById(id).classList.add('active');
}

export function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// 弹窗点击背景关闭
export function initModalBackdrop() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });

  // Esc 关闭最上层弹窗
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const openModals = document.querySelectorAll('.modal.active');
    if (!openModals.length) return;
    openModals[openModals.length - 1].classList.remove('active');
  });
}
