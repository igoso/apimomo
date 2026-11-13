/**
 * 设置管理模块
 */
import { appData, saveData } from './store.js';
import {
  proxyEnabled, proxyDropdown, proxyDropdownHeader, proxyDropdownLabel,
  proxyDropdownList, proxyNameInput, proxyUrlInput,
  btnAddProxy, proxyNoProxy, timeoutValue,
  modalSettings, btnTheme, languageSelect, btnProxyToggle
} from './dom.js';
import { closeModal, openModal } from './modal.js';
import { initLang, setLang, applyI18n, t } from './i18n.js';

/**
 * 生成唯一ID
 */
function genId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 确保代理数据为新格式（含 list 数组），并迁移旧格式
 */
function ensureProxyList() {
  if (!appData.settings) appData.settings = {};
  if (!appData.settings.proxy) appData.settings.proxy = {};

  const proxy = appData.settings.proxy;

  // 已经是新格式
  if (Array.isArray(proxy.list)) return proxy.list;

  // 旧格式迁移：有 url 字段
  if (proxy.url) {
    const migrated = [{ id: genId(), name: proxy.url, url: proxy.url }];
    proxy.list = migrated;
    proxy.selected = migrated[0].id;
    delete proxy.url;
    return proxy.list;
  }

  // 无任何代理
  proxy.list = [];
  proxy.selected = '';
  return proxy.list;
}

/**
 * 获取当前选中代理的 ID
 */
function getSelectedId() {
  return appData.settings?.proxy?.selected || '';
}

/**
 * 渲染自定义下拉列表
 */
function renderProxyDropdown() {
  const list = ensureProxyList();
  const selectedId = getSelectedId();

  // 更新头部标签
  const selected = list.find(p => p.id === selectedId);
  proxyDropdownLabel.textContent = selected ? (selected.name || selected.url) : '--';

  // 渲染列表项
  proxyDropdownList.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'proxy-dropdown-item';
    empty.style.color = 'var(--text-hint)';
    empty.style.cursor = 'default';
    empty.textContent = '--';
    proxyDropdownList.appendChild(empty);
  } else {
    list.forEach(p => {
      const item = document.createElement('div');
      item.className = 'proxy-dropdown-item' + (p.id === selectedId ? ' selected' : '');
      item.dataset.id = p.id;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'proxy-dropdown-item-name';
      nameSpan.textContent = p.name || p.url;

      const urlSpan = document.createElement('span');
      urlSpan.className = 'proxy-dropdown-item-url';
      urlSpan.textContent = p.url;

      const delBtn = document.createElement('button');
      delBtn.className = 'proxy-dropdown-item-del';
      delBtn.innerHTML = '&#10005;';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        deleteProxy(p.id);
      });

      item.appendChild(nameSpan);
      item.appendChild(urlSpan);
      item.appendChild(delBtn);

      // 点击选项 → 选中并关闭下拉
      item.addEventListener('click', () => {
        appData.settings.proxy.selected = p.id;
        closeDropdown();
        renderProxyDropdown();
      });

      proxyDropdownList.appendChild(item);
    });
  }
}

/**
 * 打开/关闭下拉
 */
function toggleDropdown() {
  proxyDropdown.classList.toggle('open');
  if (proxyDropdown.classList.contains('open')) {
    // 聚焦 URL 输入框
    proxyUrlInput.focus();
  }
}

function closeDropdown() {
  proxyDropdown.classList.remove('open');
}

export function loadSettings() {
  const s = appData.settings || {};
  proxyEnabled.checked = s.proxy?.enabled || false;
  proxyNoProxy.value = s.proxy?.noProxy || '';
  document.getElementById('ignore-ssl').checked = s.ignoreSsl || false;
  timeoutValue.value = s.timeout || 30000;

  renderProxyDropdown();
  refreshProxyIndicator();

  const versionEl = document.getElementById('app-version');
  if (versionEl && typeof __APP_VERSION__ !== 'undefined') {
    versionEl.textContent = __APP_VERSION__;
  }

  applyTheme(appData.settings?.theme || 'dark');

  initLang();
  if (languageSelect) {
    languageSelect.value = appData.settings?.language || 'en';
  }
}

export function saveSettings() {
  const list = ensureProxyList();
  const selectedId = getSelectedId();

  appData.settings = {
    proxy: {
      enabled: proxyEnabled.checked,
      selected: selectedId,
      noProxy: proxyNoProxy.value.trim(),
      list
    },
    ignoreSsl: document.getElementById('ignore-ssl').checked,
    timeout: parseInt(timeoutValue.value) || 30000,
    theme: appData.settings?.theme || 'dark',
    language: languageSelect?.value || appData.settings?.language || 'en'
  };
  saveData(appData);

  refreshProxyIndicator();

  setLang(appData.settings.language);
  closeModal('modal-settings');
}

/**
 * 添加代理（不自动增加 http 前缀）
 */
function addProxy() {
  let name = proxyNameInput.value.trim();
  let url = proxyUrlInput.value.trim();

  if (!url) return;
  // 不额外添加 http:// 前缀，用户输入什么就存什么
  if (!name) name = url;

  const list = ensureProxyList();
  const newProxy = { id: genId(), name, url };
  list.push(newProxy);
  appData.settings.proxy.selected = newProxy.id;

  proxyNameInput.value = '';
  proxyUrlInput.value = '';
  renderProxyDropdown();

  // 添加后聚焦 URL 输入框，方便继续添加
  proxyUrlInput.focus();
}

/**
 * 删除指定 ID 的代理
 */
function deleteProxy(id) {
  const list = ensureProxyList();
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return;

  list.splice(idx, 1);

  // 如果删除的是当前选中项，自动选下一项
  if (appData.settings.proxy.selected === id) {
    if (list.length > 0) {
      const nextIdx = Math.min(idx, list.length - 1);
      appData.settings.proxy.selected = list[nextIdx].id;
    } else {
      appData.settings.proxy.selected = '';
    }
  }

  renderProxyDropdown();
}

/**
 * 应用主题到 DOM
 */
const SUN_ICON = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (btnTheme) {
    btnTheme.innerHTML = theme === 'light' ? SUN_ICON : MOON_ICON;
    btnTheme.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
  }
}

/**
 * 切换主题
 */
export function toggleTheme() {
  const current = appData.settings?.theme || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  if (!appData.settings) appData.settings = {};
  appData.settings.theme = next;
  applyTheme(next);
  saveData(appData);
}

// ========== 地址栏代理状态图标 ==========

/**
 * 刷新地址栏最右侧的代理状态图标
 * 使用代理：高亮"中转"图标，悬停提示 proxyed: <代理地址>
 * 无代理：灰色"直连"图标，悬停提示 noproxy
 */
export function refreshProxyIndicator() {
  if (!btnProxyToggle) return;
  const proxy = appData.settings?.proxy;
  const selected = Array.isArray(proxy?.list) ? proxy.list.find(p => p.id === proxy.selected) : null;
  const active = !!(proxy?.enabled && selected);

  btnProxyToggle.classList.toggle('active', active);
  if (active) {
    // 与请求发送时一致的协议补全规则（已带任意协议前缀则保持原样）
    let url = selected.url;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'http://' + url;
    btnProxyToggle.title = `${t('res.proxy')}: ${url}`;
  } else {
    btnProxyToggle.title = t('res.direct');
  }
}

/**
 * 移除代理快速选择菜单
 */
let proxyMenuOpenedAt = 0;
function removeProxyMenu() {
  document.querySelectorAll('.proxy-quick-menu').forEach(m => m.remove());
}

/**
 * 弹出代理快速选择菜单（挂 body 固定定位，避免被容器裁剪）
 * 菜单项：不使用代理 / 各代理项（勾选当前生效项）/ 代理设置入口
 */
function showProxyMenu() {
  removeProxyMenu();

  const proxy = appData.settings?.proxy || {};
  const list = ensureProxyList();
  const enabled = !!proxy.enabled;
  const selectedId = getSelectedId();

  const menu = document.createElement('div');
  menu.className = 'proxy-quick-menu';

  /** 构建单个菜单项（勾选符号 + 文本内容，文本用 textContent 防注入） */
  function buildItem(className, checked, onClick) {
    const item = document.createElement('div');
    item.className = 'proxy-quick-item' + (checked ? ' checked' : '') + (className ? ' ' + className : '');
    const check = document.createElement('span');
    check.className = 'check';
    check.innerHTML = '&#10003;';
    item.appendChild(check);
    onClick && item.addEventListener('click', onClick);
    menu.appendChild(item);
    return item;
  }

  // 不使用代理
  const noProxyItem = buildItem('', !enabled || !selectedId, disableProxyFromMenu);
  const noProxyLabel = document.createElement('span');
  noProxyLabel.textContent = t('url.noProxy');
  noProxyItem.appendChild(noProxyLabel);

  // 代理列表
  if (list.length > 0) {
    menu.appendChild(document.createElement('div')).className = 'proxy-quick-separator';
    list.forEach(p => {
      const item = buildItem('', enabled && p.id === selectedId, () => selectProxyFromMenu(p.id));
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.name || p.url;
      const url = document.createElement('span');
      url.className = 'url';
      url.textContent = p.url;
      item.append(name, url);
    });
  }

  // 代理设置入口
  menu.appendChild(document.createElement('div')).className = 'proxy-quick-separator';
  const settingsItem = buildItem('settings-entry', false, () => {
    removeProxyMenu();
    loadSettings();
    openModal('modal-settings');
  });
  const settingsLabel = document.createElement('span');
  settingsLabel.textContent = t('url.proxySettings');
  settingsItem.appendChild(settingsLabel);

  document.body.appendChild(menu);

  // 定位：按钮正下方，右对齐按钮右缘
  const rect = btnProxyToggle.getBoundingClientRect();
  menu.style.left = rect.right + 'px';
  menu.style.top = (rect.bottom + 6) + 'px';
  // 避免溢出屏幕底部
  const maxH = window.innerHeight - rect.bottom - 20;
  if (maxH > 120 && menu.offsetHeight > maxH) {
    menu.style.maxHeight = maxH + 'px';
    menu.style.overflowY = 'auto';
  }

  proxyMenuOpenedAt = Date.now();
}

/**
 * 菜单选择代理：启用并切换到该代理
 */
function selectProxyFromMenu(id) {
  ensureProxyList();
  appData.settings.proxy.enabled = true;
  appData.settings.proxy.selected = id;
  saveData(appData);
  removeProxyMenu();
  refreshProxyIndicator();
}

/**
 * 菜单选择"不使用代理"：关闭代理
 */
function disableProxyFromMenu() {
  ensureProxyList();
  appData.settings.proxy.enabled = false;
  saveData(appData);
  removeProxyMenu();
  refreshProxyIndicator();
}

// 语言切换后同步刷新图标的悬停提示（经 window 桥接避免循环依赖）
window.__refreshProxyIndicator = refreshProxyIndicator;

// ========== 事件绑定 ==========

if (btnTheme) {
  btnTheme.addEventListener('click', toggleTheme);
}

// 下拉头部点击展开/收起
if (proxyDropdownHeader) {
  proxyDropdownHeader.addEventListener('click', toggleDropdown);
}

// 点击外部关闭下拉
document.addEventListener('click', e => {
  if (proxyDropdown && !proxyDropdown.contains(e.target)) {
    closeDropdown();
  }
});

// 添加代理按钮
if (btnAddProxy) {
  btnAddProxy.addEventListener('click', addProxy);
}

// URL 输入框回车添加
if (proxyUrlInput) {
  proxyUrlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addProxy();
  });
}

// 地址栏代理图标：点击弹出/收起快速选择菜单
// （阻止冒泡，避免被下方“点击外部关闭”监听误关）
if (btnProxyToggle) {
  btnProxyToggle.addEventListener('click', e => {
    e.stopPropagation();
    // 以 DOM 实际状态判断开关（标志位曾与 DOM 脱节，导致点击时误判为“菜单已开”而只做关闭、看似无响应）
    if (document.querySelector('.proxy-quick-menu')) {
      // 刚弹出后极短时间内的再次点击（双击习惯）不视为关闭，避免菜单“开了立刻关”看起来没出现
      if (Date.now() - proxyMenuOpenedAt < 250) return;
      removeProxyMenu();
      return;
    }
    // 清掉可能残留的右键菜单，避免其覆盖在按钮/菜单上方吃掉点击
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    showProxyMenu();
  });
}

// 点击代理菜单外部时关闭菜单。
// 用 mousedown + 捕获阶段：即使别的组件在自己的 click 里 stopPropagation，也一定能收到
document.addEventListener('mousedown', e => {
  const menu = document.querySelector('.proxy-quick-menu');
  if (!menu) return;
  if (menu.contains(e.target) || btnProxyToggle?.contains(e.target)) return;
  removeProxyMenu();
}, true);
