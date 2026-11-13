/**
 * 数据持久化层
 * 使用 window.require 兼容 Electron nodeIntegration 环境
 */
const fs = window.require('fs');
const path = window.require('path');

// 数据文件路径：优先取主进程注入的用户数据目录路径（--apimomo-data-file 参数），
// 回退到构建时注入的路径（兼容无参数环境，如自动化测试窗口）
function resolveDataFile() {
  const prefix = '--apimomo-data-file=';
  const args = typeof process !== 'undefined' && process.argv ? process.argv : [];
  const arg = args.find(a => a.startsWith(prefix));
  if (arg) {
    try {
      return decodeURIComponent(arg.slice(prefix.length));
    } catch (e) {
      console.error('Parse data file arg error:', e);
    }
  }
  return typeof __DATA_FILE_PATH__ !== 'undefined' ? __DATA_FILE_PATH__ : '';
}

const DATA_FILE = resolveDataFile();

// 标签页会话文件（退出时暂存当前标签与未保存修改），与数据文件同目录
export const SESSION_FILE = DATA_FILE ? path.join(path.dirname(DATA_FILE), 'session.json') : '';

export function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Load data error:', e);
    // 记录读取失败（文件存在但读取/解析失败），供 UI 初始化后提示
    window.__loadDataError = e;
  }
  return { collections: [], history: [], settings: {} };
}

export function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Save data error:', e);
    // 通过桥接通知 UI（避免与 utils/i18n 形成循环依赖）
    if (typeof window.__onSaveDataError === 'function') {
      window.__onSaveDataError(e);
    }
    return false;
  }
}

// 全局应用数据
export const appData = loadData();
if (!appData.collections) appData.collections = [];
if (!appData.history) appData.history = [];
if (!appData.settings) appData.settings = {};
if (!appData.tagColors) appData.tagColors = {};
// 界面布局（侧边栏宽度、请求/响应分栏宽度），由拖拽分割线写入
if (!appData.layout) appData.layout = {};
