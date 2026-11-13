import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, ipcMain, session, Menu, dialog, screen } from 'electron';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 模块级设置缓存，供 IPC handler 读取代理配置
let appSettings = {};

// 数据文件路径：默认存放于系统用户数据目录（Windows: %APPDATA%/apimomo/data.json，无需管理员权限）
// 支持环境变量 APIMOMO_DATA_FILE 覆盖（测试/调试用）
function getDataFilePath() {
  return process.env.APIMOMO_DATA_FILE || path.join(app.getPath('userData'), 'data.json');
}

// 首次启动迁移：用户数据目录尚无数据文件时，尝试从旧位置复制一份
// （旧版本把数据写在应用目录，如开发环境项目根的 data.json）
function migrateDataFile() {
  const target = getDataFilePath();
  if (fs.existsSync(target)) return;
  const candidates = [
    path.join(app.getAppPath(), 'data.json'),                 // 开发环境项目根（旧版本默认写入位置）
    path.join(__dirname, '../data.json'),                      // 直接运行 electron/main.js 时
    path.join(path.dirname(app.getPath('exe')), 'data.json')   // 便携版 exe 同级
  ];
  const source = candidates.find(p => p !== target && fs.existsSync(p));
  if (!source) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    console.log(`Migrated data file: ${source} -> ${target}`);
  } catch (e) {
    console.error('Migrate data file error:', e);
  }
}

// 代理绕过检测（模块级，供 http-request / http-stream-request 共用）
function shouldBypassProxy(targetUrl, noProxy) {
  if (!noProxy || !targetUrl) return false;
  try {
    const hostname = new URL(targetUrl).hostname;
    const patterns = noProxy.split(',').map(s => s.trim()).filter(Boolean);
    for (const pattern of patterns) {
      if (pattern === '*') return true;
      let clean = pattern;
      if (clean.startsWith('*.')) clean = clean.slice(2);
      else if (clean.startsWith('.')) clean = clean.slice(1);
      if (hostname === clean) return true;
      if (hostname.endsWith('.' + clean)) return true;
    }
  } catch {}
  return false;
}

// 按代理 URL 协议构造 Agent：http(s):// 走 Http(S)ProxyAgent，socks/socks4/socks4a/socks5/socks5h 走 SocksProxyAgent
// （socks 代理下 http 与 https 目标都由 SocksProxyAgent 建立隧道；https 的证书校验仍由请求级 rejectUnauthorized 控制）
function createProxyAgent(proxyUrlStr, targetProtocol, ignoreSsl) {
  let scheme = '';
  try {
    scheme = new URL(proxyUrlStr).protocol.replace(':', '').toLowerCase();
  } catch {}
  if (scheme.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrlStr);
  }
  if (targetProtocol === 'https:') {
    return new HttpsProxyAgent(proxyUrlStr, ignoreSsl ? { rejectUnauthorized: false } : {});
  }
  return new HttpProxyAgent(proxyUrlStr);
}

// 读取界面语言（data.json 的 settings.language），供主进程菜单文案使用
function getUiLanguage() {
  try {
    const dataFile = getDataFilePath();
    if (fs.existsSync(dataFile)) {
      const lang = JSON.parse(fs.readFileSync(dataFile, 'utf-8')).settings?.language;
      if (lang) return lang;
    }
  } catch {}
  return 'en';
}

// ==================== 媒体右键另存为 ====================

// 右键菜单文案（与渲染进程 i18n 的语言代码一致）
const MEDIA_MENU_LABELS = {
  en: { image: 'Save image as...', audio: 'Save audio as...', video: 'Save video as...' },
  zh: { image: '图片另存为...', audio: '音频另存为...', video: '视频另存为...' },
  ja: { image: '画像を名前を付けて保存...', audio: 'オーディオを名前を付けて保存...', video: 'ビデオを名前を付けて保存...' },
  'zh-TW': { image: '圖片另存為...', audio: '音訊另存為...', video: '影片另存為...' }
};

const MEDIA_SAVE_FILTERS = {
  image: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tif', 'tiff'] }, { name: 'All Files', extensions: ['*'] }],
  audio: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] }, { name: 'All Files', extensions: ['*'] }],
  video: [{ name: 'Video', extensions: ['mp4', 'webm', 'ogv', 'mov', 'mkv', 'mpeg', 'ts'] }, { name: 'All Files', extensions: ['*'] }]
};

// 忽略证书错误（适用于内网自签名证书环境）
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');

const createWindow = () => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    // 无边框窗口：标题栏由渲染进程自绘（顶部标签栏 + 窗口按钮）
    frame: false,
    // 开发模式窗口/任务栏图标（打包后由 electron-builder 嵌入 exe 图标）
    ...(process.env.VITE_DEV_SERVER_URL
      ? { icon: path.join(__dirname, '../build/icon.png') }
      : {}),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      // 将数据文件路径注入渲染进程（process.argv），供渲染层 store.js 读写
      additionalArguments: [`--apimomo-data-file=${encodeURIComponent(getDataFilePath())}`]
    }
  });

  // 开发模式加载 Vite dev server，生产模式加载打包后的文件
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 媒体（图片/音频/视频）右键另存为：
  // 响应预览中的媒体为 file:// 临时文件 → 直接复制；HTML 预览等场景的远程媒体 URL → 流式下载
  win.webContents.on('context-menu', (event, params) => {
    const kind = params.mediaType;
    if (kind !== 'image' && kind !== 'audio' && kind !== 'video') return;
    const src = params.srcURL || '';
    if (!src) return;
    const labels = MEDIA_MENU_LABELS[getUiLanguage()] || MEDIA_MENU_LABELS.en;
    const menu = Menu.buildFromTemplate([
      {
        label: labels[kind],
        click: async () => {
          // 默认文件名取 URL 最后一段，无扩展名时按媒体大类兜底
          let name = '';
          try { name = decodeURIComponent(new URL(src).pathname.split('/').pop() || ''); } catch {}
          if (!name.includes('.')) {
            name = 'response.' + (kind === 'image' ? 'png' : kind === 'audio' ? 'mp3' : 'mp4');
          }
          const result = await dialog.showSaveDialog(win, {
            defaultPath: name,
            filters: MEDIA_SAVE_FILTERS[kind]
          });
          if (result.canceled || !result.filePath) return;
          try {
            if (src.startsWith('file://')) {
              fs.copyFileSync(fileURLToPath(new URL(src)), result.filePath);
            } else {
              await downloadToFile({ url: src, method: 'GET', filePath: result.filePath });
            }
          } catch (err) {
            dialog.showErrorBox('ApiMomo', String(err?.message || err));
          }
        }
      }
    ]);
    menu.popup({ window: win, x: params.x, y: params.y });
  });
};

// 流式下载请求到本地文件（「确认直接下载」按钮与右键另存为共用）
// 尊重代理与 SSL 设置，不把响应内容读进内存
function downloadToFile(options) {
  const urlObj = new URL(options.url);
  const client = urlObj.protocol === 'https:' ? https : http;
  const proxySetting = appSettings.proxy || {};
  const bypass = shouldBypassProxy(options.url, proxySetting.noProxy);
  const proxyUrlStr = (proxySetting.enabled && !bypass) ? proxySetting.url : '';
  const ignoreSsl = options.ignoreSsl || false;

  return new Promise((resolve, reject) => {
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    if (urlObj.protocol === 'https:' && ignoreSsl) {
      reqOptions.rejectUnauthorized = false;
    }
    if (proxyUrlStr) {
      reqOptions.agent = createProxyAgent(proxyUrlStr, urlObj.protocol, ignoreSsl);
    }

    const req = client.request(options.url, reqOptions, res => {
      if (res.statusCode >= 400) {
        req.destroy();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const ws = fs.createWriteStream(options.filePath);
      res.pipe(ws);
      ws.on('finish', () => resolve({ statusCode: res.statusCode, bytes: ws.bytesWritten }));
      ws.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    // 下载同样受设置中的 timeout 约束（空闲超时，持续写入不会误伤）
    const timeoutMs = Number(options.timeout) > 0 ? Number(options.timeout) : 30000;
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s (REQUEST_TIMEOUT)`));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ==================== 自绘窗口控制（无边框窗口） ====================
ipcMain.handle('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle('window-toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// 媒体响应临时文件：图片/音频/视频写入临时目录，渲染进程经 file:// 直读展示，
// 避免大体积 base64 走 IPC 与 data URL 造成的界面阻塞
function mediaExt(contentType) {
  const [major, sub = ''] = String(contentType || '').split(';')[0].split('/');
  // audio/mpeg 的规范子类型是 mpeg，扩展名应为 mp3（video/mpeg 仍用 mpeg）
  if (major === 'audio' && sub === 'mpeg') return 'mp3';
  const map = {
    png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp', svg: 'svg', 'svg+xml': 'svg',
    bmp: 'bmp', ico: 'ico', 'x-icon': 'ico', 'vnd.microsoft.icon': 'ico', avif: 'avif', tiff: 'tif',
    mp3: 'mp3', wav: 'wav', 'x-wav': 'wav', ogg: 'ogg', m4a: 'm4a', flac: 'flac', aac: 'aac',
    'mp4': 'mp4', webm: 'webm', ogv: 'ogv', quicktime: 'mov', mov: 'mov', mkv: 'mkv', mpeg: 'mpeg', mp2t: 'ts'
  };
  return map[sub] || 'bin';
}

// 魔数嗅探：服务器返回的 content-type 不是媒体（octet-stream / text 等）时，
// 按内容前几个字节识别实际类型，使“头不对但内容是图片/音视频”的响应仍能正常预览
function sniffMediaType(buf) {
  if (!buf || buf.length === 0) return null;
  const tag = (start, end) => buf.subarray(start, end).toString('latin1');
  // 图片
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const gif = tag(0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (tag(0, 4) === 'RIFF') {
    const kind = tag(8, 12);
    if (kind === 'WEBP') return 'image/webp';
    if (kind === 'WAVE') return 'audio/wav';
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'image/x-icon';
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[3] === 0x2a)) return 'image/tiff';
  if (tag(4, 8) === 'ftyp') {
    const brand = tag(8, 12);
    if (brand.startsWith('avi')) return 'image/avif';
    if (brand.startsWith('M4A')) return 'audio/mp4';
    return 'video/mp4';
  }
  // 音频 / 视频
  if (tag(0, 4) === 'OggS') {
    return buf.subarray(0, 512).indexOf('theora') !== -1 ? 'video/ogg' : 'audio/ogg';
  }
  if (tag(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (tag(0, 4) === 'fLaC') return 'audio/flac';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  // SVG（文本格式，非二进制魔数）
  const head = buf.subarray(0, 512).toString('utf-8').replace(/^\uFEFF/, '').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

function writeMediaFile(buf, contentType) {
  // 清理超过 1 小时的旧媒体临时文件，避免长期累积
  try {
    const tmp = app.getPath('temp');
    for (const f of fs.readdirSync(tmp)) {
      if (f.startsWith('apimomo-media-')) {
        const p = path.join(tmp, f);
        if (Date.now() - fs.statSync(p).mtimeMs > 3600 * 1000) fs.unlinkSync(p);
      }
    }
  } catch {}
  const file = path.join(app.getPath('temp'), `apimomo-media-${Date.now()}.${mediaExt(contentType)}`);
  fs.writeFileSync(file, buf);
  return file;
}

// 窗口拖动：-webkit-app-region: drag 在部分环境（本机 Electron 35 / Windows）不生效，
// 改为渲染进程按下拖动区后通知主进程，由主进程按鼠标位移移动窗口
let windowDragTimer = null;

function stopWindowDrag() {
  if (windowDragTimer) {
    clearInterval(windowDragTimer);
    windowDragTimer = null;
  }
}

ipcMain.on('window-drag-start', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  stopWindowDrag();

  // 最大化时先还原，并让鼠标仍落在窗口顶部附近
  if (win.isMaximized()) {
    const cursor = screen.getCursorScreenPoint();
    win.unmaximize();
    const { width } = win.getBounds();
    win.setPosition(Math.round(cursor.x - width / 2), cursor.y - 12);
  }

  const startBounds = win.getBounds();
  const startCursor = screen.getCursorScreenPoint();
  windowDragTimer = setInterval(() => {
    if (win.isDestroyed()) {
      stopWindowDrag();
      return;
    }
    const p = screen.getCursorScreenPoint();
    win.setPosition(startBounds.x + (p.x - startCursor.x), startBounds.y + (p.y - startCursor.y));
  }, 10);
});

ipcMain.on('window-drag-end', stopWindowDrag);

app.whenReady().then(() => {
  // 数据文件迁移须在读取设置与创建窗口之前
  migrateDataFile();
  createWindow();

  // 读取设置并初始化代理 / SSL（与渲染进程使用同一数据文件）
  const dataFile = getDataFilePath();
  try {
    if (fs.existsSync(dataFile)) {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
      appSettings = data.settings || {};
    }
  } catch (e) {
    console.error('Read settings error:', e);
  }

  // 初始化代理
  const proxyUrl = appSettings.proxy?.enabled ? appSettings.proxy.url : '';
  if (proxyUrl) {
    session.defaultSession.setProxy({ proxyRules: proxyUrl });
  } else {
    session.defaultSession.setProxy({ proxyRules: 'direct://' });
  }

  // 初始化 SSL 验证
  const ignoreSsl = appSettings.ignoreSsl || false;
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    callback(ignoreSsl ? 0 : -3);
  });

  // IPC: 设置代理
  ipcMain.handle('set-proxy', async (event, proxyUrl, noProxy) => {
    // 补全协议前缀（用户可能只输入 host:port；已带任意协议前缀则保持原样）
    let resolvedUrl = proxyUrl;
    if (resolvedUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(resolvedUrl)) {
      resolvedUrl = 'http://' + resolvedUrl;
    }
    if (resolvedUrl) {
      await session.defaultSession.setProxy({ proxyRules: resolvedUrl });
    } else {
      await session.defaultSession.setProxy({ proxyRules: 'direct://' });
    }
    // 同步更新模块级设置，供原生 http/https 请求使用
    if (!appSettings.proxy) appSettings.proxy = {};
    appSettings.proxy.url = resolvedUrl;
    appSettings.proxy.enabled = !!resolvedUrl;
    appSettings.proxy.noProxy = noProxy || '';
  });

  // IPC: 设置忽略 SSL（同时更新模块级缓存，供原生 https 请求使用）
  ipcMain.handle('set-ignore-ssl', (event, ignore) => {
    appSettings.ignoreSsl = !!ignore;
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      callback(ignore ? 0 : -3);
    });
  });

  // 进行中的普通请求（供取消功能使用）：requestId -> { req, cancelled }
  const activeRequests = new Map();

  // IPC: 发送 HTTP 请求（使用 Node.js 原生 http/https 模块，无 header 限制）
  ipcMain.handle('http-request', async (event, options) => {
    const urlObj = new URL(options.url);
    const requestId = options.requestId || null;
    const client = urlObj.protocol === 'https:' ? https : http;

    const proxySetting = appSettings.proxy || {};
    const bypass = shouldBypassProxy(options.url, proxySetting.noProxy);
    const proxyUrlStr = (proxySetting.enabled && !bypass) ? proxySetting.url : '';
    // 直接使用请求参数中的 ignoreSsl，避免依赖模块级缓存可能的时序问题
    const ignoreSsl = options.ignoreSsl || false;

    // 当 ignoreSsl 开启时，临时设置 NODE_TLS_REJECT_UNAUTHORIZED='0'
    // 这是最可靠的方式确保 Node.js https 模块跳过证书校验
    // （仅在请求期间设置，请求完成后立即恢复）
    const savedTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (ignoreSsl) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    try {
      return await new Promise((resolve, reject) => {
        // 构建请求选项
        const reqOptions = {
          method: options.method || 'GET',
          headers: options.headers || {}
        };

        // HTTPS 请求忽略证书校验：必须在请求选项上设置 rejectUnauthorized
        if (urlObj.protocol === 'https:' && ignoreSsl) {
          reqOptions.rejectUnauthorized = false;
        }

        // 代理 agent：http(s) 代理按目标协议选择 Http(s)ProxyAgent，socks 代理用 SocksProxyAgent
        // （ignoreSsl 时 HttpsProxyAgent 携带 rejectUnauthorized，避免 CONNECT 隧道的最终 TLS 握手仍校验证书）
        if (proxyUrlStr) {
          reqOptions.agent = createProxyAgent(proxyUrlStr, urlObj.protocol, ignoreSsl);
        }

        const req = client.request(
          options.url,
          reqOptions,
          res => {
            // 媒体响应（图片/音频/视频）：超过 20MB 不下载直接提示；未超限以 base64 返回供展示
            const contentType = String(res.headers['content-type'] || '').toLowerCase();
            const MEDIA_LIMIT = 20 * 1024 * 1024;
            if (/^(image|audio|video)\//.test(contentType)) {
              let mediaDone = false;
              req.__mediaHandled = true;
              const finishMedia = payload => {
                if (mediaDone) return;
                mediaDone = true;
                if (requestId) activeRequests.delete(requestId);
                resolve({
                  statusCode: res.statusCode,
                  statusMessage: res.statusMessage,
                  headers: res.headers,
                  // 实际用于展示/落盘的内容类型（渲染进程优先用它判断媒体）
                  mediaContentType: contentType,
                  ...payload
                });
              };
              const declared = parseInt(res.headers['content-length'] || '', 10);
              // 从响应头判断：声明超过限制直接中断，不下载
              if (Number.isFinite(declared) && declared > MEDIA_LIMIT) {
                finishMedia({ mediaTooLarge: true, body: '' });
                req.destroy();
                return;
              }
              let buf = Buffer.alloc(0);
              let overLimit = false;
              res.on('data', chunk => {
                if (overLimit) return;
                buf = Buffer.concat([buf, chunk]);
                // 无 Content-Length 时按实际接收量兜底判断
                if (buf.length > MEDIA_LIMIT) {
                  overLimit = true;
                  finishMedia({ mediaTooLarge: true, body: '' });
                  req.destroy();
                }
              });
              res.on('end', () => {
                // 落盘临时文件返回路径，避免大体积 base64 阻塞渲染进程
                try {
                  finishMedia({ mediaFile: writeMediaFile(buf, contentType), mediaSize: buf.length, body: '' });
                } catch (e) {
                  reject(e);
                }
              });
              // 流中断（代理断开等）如实报错，不再误报为超过大小限制
              res.on('error', err => {
                if (mediaDone) return;
                mediaDone = true;
                if (requestId) activeRequests.delete(requestId);
                reject(err instanceof Error ? err : new Error('Response stream error'));
              });
              return;
            }

            let body = Buffer.alloc(0);
            res.on('data', chunk => {
              body = Buffer.concat([body, chunk]);
            });
            res.on('end', () => {
              if (requestId) activeRequests.delete(requestId);
              // 响应头不是媒体（octet-stream / text 等）时按魔数嗅探实际内容：
              // 命中图片/音视频仍按媒体走临时文件预览，避免二进制被当 UTF-8 文本破坏
              const sniffed = sniffMediaType(body);
              if (sniffed) {
                if (body.length > MEDIA_LIMIT) {
                  resolve({
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                    headers: res.headers,
                    mediaContentType: sniffed,
                    mediaSize: body.length,
                    mediaTooLarge: true,
                    body: ''
                  });
                  return;
                }
                try {
                  resolve({
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                    headers: res.headers,
                    mediaContentType: sniffed,
                    mediaFile: writeMediaFile(body, sniffed),
                    mediaSize: body.length,
                    body: ''
                  });
                } catch (e) {
                  reject(e);
                }
                return;
              }
              resolve({
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                headers: res.headers,
                body: body.toString('utf8')
              });
            });
            // 普通响应流中断同样需要落定 Promise，否则界面会一直停在发送中
            res.on('error', err => {
              if (requestId) activeRequests.delete(requestId);
              reject(err instanceof Error ? err : new Error('Response stream error'));
            });
          }
        );

        // 请求空闲超时：落实设置中的 timeout（连接黑洞/响应停滞时按配置时间报错，
        // 而不是等系统 TCP 超时或无限挂起）；持续有数据的下载不会被误伤
        const timeoutMs = Number(options.timeout) > 0 ? Number(options.timeout) : 30000;
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s (REQUEST_TIMEOUT)`));
        });

        req.on('error', err => {
          const entry = requestId ? activeRequests.get(requestId) : null;
          if (requestId) activeRequests.delete(requestId);
          // 用户主动取消：以正常结果返回特定标识，供渲染进程识别
          // （不用 reject，避免 Electron 记录多余的 handler 错误日志）
          if (entry && entry.cancelled) {
            resolve({ cancelled: true });
          } else {
            reject(err);
          }
        });

        if (requestId) activeRequests.set(requestId, { req, cancelled: false });

        if (options.body) {
          req.write(options.body);
        }
        req.end();
      });
    } finally {
      // 恢复 NODE_TLS_REJECT_UNAUTHORIZED 环境变量
      if (ignoreSsl) {
        if (savedTlsReject === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = savedTlsReject;
        }
      }
    }
  });

  // IPC: 取消进行中的普通请求
  ipcMain.handle('http-request-abort', (event, requestId) => {
    const entry = activeRequests.get(requestId);
    if (entry) {
      entry.cancelled = true;
      entry.req.destroy();
      return true;
    }
    return false;
  });

  // IPC: 直接下载响应到文件（超大媒体响应确认后使用，流式写盘不占内存）
  ipcMain.handle('download-request', async (event, options) => downloadToFile(options));

  // IPC: 流式 HTTP 请求（用于 SSE / OpenAI Streaming 等场景）
  // 返回 { streamId }，后续通过事件发送数据
  let activeStreamReqs = {};

  ipcMain.handle('http-stream-request', async (event, options) => {
    // 使用渲染进程传入的 streamId，避免事件监听竞态
    const streamId = options.streamId || ('stream-' + Date.now());
    const urlObj = new URL(options.url);
    const client = urlObj.protocol === 'https:' ? https : http;

    // 复用代理逻辑（shouldBypassProxy 已是模块级函数）
    const proxySetting = appSettings.proxy || {};
    const bypass = shouldBypassProxy(options.url, proxySetting.noProxy);
    const proxyUrlStr = (proxySetting.enabled && !bypass) ? proxySetting.url : '';
    const ignoreSsl = options.ignoreSsl || false;

    const savedTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (ignoreSsl) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    // 恢复 SSL 环境变量的辅助函数（流式请求不能在 finally 中立即恢复，
    // 需在请求真正结束时恢复）
    function restoreTlsEnv() {
      if (ignoreSsl) {
        if (savedTlsReject === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = savedTlsReject;
        }
      }
    }

    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (urlObj.protocol === 'https:' && ignoreSsl) {
      reqOptions.rejectUnauthorized = false;
    }

    if (proxyUrlStr) {
      reqOptions.agent = createProxyAgent(proxyUrlStr, urlObj.protocol, ignoreSsl);
    }

    try {
      const req = client.request(options.url, reqOptions, res => {
        // 先发送响应头信息
        event.sender.send('stream-start', streamId, {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers
        });

        res.on('data', chunk => {
          event.sender.send('stream-chunk', streamId, chunk.toString('utf8'));
        });

        res.on('end', () => {
          event.sender.send('stream-end', streamId);
          delete activeStreamReqs[streamId];
          restoreTlsEnv();
        });
      });

      req.on('error', err => {
        event.sender.send('stream-error', streamId, err.message);
        delete activeStreamReqs[streamId];
        restoreTlsEnv();
      });

      activeStreamReqs[streamId] = req;

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    } catch (err) {
      event.sender.send('stream-error', streamId, err.message);
      restoreTlsEnv();
    }

    return { streamId };
  });

  // IPC: 取消流式请求
  ipcMain.handle('http-stream-abort', (event, streamId) => {
    if (activeStreamReqs[streamId]) {
      activeStreamReqs[streamId].destroy();
      delete activeStreamReqs[streamId];
    }
    return true;
  });

  // IPC: 打开文件选择对话框（返回所选文件路径，取消时返回 null）
  ipcMain.handle('open-file-dialog', async (event, options = {}) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: options.filters || [{ name: 'JSON', extensions: ['json'] }],
      title: options.title || undefined
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  // IPC: 保存文件对话框（返回目标路径，取消时返回 null）
  ipcMain.handle('save-file-dialog', async (event, options = {}) => {
    const result = await dialog.showSaveDialog({
      filters: options.filters || [{ name: 'JSON', extensions: ['json'] }],
      defaultPath: options.defaultPath || undefined,
      title: options.title || undefined
    });
    return result.canceled || !result.filePath ? null : result.filePath;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 退出时清理媒体临时文件
app.on('will-quit', () => {
  try {
    const tmp = app.getPath('temp');
    for (const f of fs.readdirSync(tmp)) {
      if (f.startsWith('apimomo-media-')) {
        try { fs.unlinkSync(path.join(tmp, f)); } catch {}
      }
    }
  } catch {}
});
