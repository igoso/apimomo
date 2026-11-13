/**
 * HTTP 请求发送与响应展示模块
 * 使用 window.require 兼容 Electron nodeIntegration 环境
 */
const { ipcRenderer } = window.require('electron');
import { appData, saveData } from './store.js';
import { currentRequest, currentResponse, currentView, setCurrentResponse } from './state.js';
import {
  methodSelect, urlInput, bodyEditor, bodyType, btnSend,
  responseStatus, responseTime, responseSize, responseBody
} from './dom.js';
import { escapeHtml, formatBytes, highlightJson, highlightXml, addLineNumbers, showToast, parseSSEChunks, isStreamRequest } from './utils.js';
import { getKVItems } from './kv-table.js';
import { getMultipartItems, buildMultipartBody, buildUrlEncodedBody } from './form-data.js';
import { t } from './i18n.js';

// 流式请求状态
let activeStreamId = null;
let streamCleanup = null;
let streamCancelHandler = null;  // 流式请求被取消时的收尾（定格已接收内容）

// 请求进行中状态（Send 按钮"悬停变取消"功能使用）
let isRequesting = false;
let activeRequestId = null;   // 进行中的普通请求 id（流式请求使用 activeStreamId 取消）
let activeStartTime = 0;

/**
 * 切换请求进行中状态（控制 Send 按钮的可取消样式）
 */
function setRequesting(on, startTime) {
  isRequesting = on;
  if (on && startTime) activeStartTime = startTime;
  if (btnSend) btnSend.classList.toggle('sending', on);
}

/**
 * 判断错误是否来自用户主动取消
 */
function isCancelledError(err) {
  const msg = err?.message || String(err);
  return msg.includes('REQUEST_CANCELLED');
}

/**
 * 取消当前进行中的请求（普通或流式），并将界面更新为"已取消"
 */
export async function cancelActiveRequest() {
  if (!isRequesting) return;

  const requestId = activeRequestId;
  const streamId = activeStreamId;
  const cancelFinalize = streamCancelHandler;

  // 立即复位状态，避免重复取消
  activeRequestId = null;
  activeStreamId = null;
  streamCleanup = null;
  streamCancelHandler = null;
  setRequesting(false);

  // 通知主进程中断请求
  if (streamId) {
    try { await ipcRenderer.invoke('http-stream-abort', streamId); } catch {}
  } else if (requestId) {
    try { await ipcRenderer.invoke('http-request-abort', requestId); } catch {}
  }

  // 状态栏显示"已取消"
  const duration = activeStartTime ? Date.now() - activeStartTime : 0;
  responseStatus.textContent = t('res.cancelled');
  responseStatus.className = 'response-status cancelled';
  responseTime.textContent = duration ? `${duration} ms` : '';
  responseSize.textContent = '';
  if (cancelFinalize) {
    // 流式：定格已接收内容（无内容时显示提示）
    cancelFinalize();
  } else {
    responseBody.innerHTML = `<code>${escapeHtml(t('res.cancelledHint'))}</code>`;
  }
}

/** 从响应头取 content-type；为媒体类型（图片/音频/视频）时返回小写完整值，否则 null */
function mediaType(headers) {
  const entry = Object.entries(headers || {}).find(([k]) => k.toLowerCase() === 'content-type');
  const ct = (entry?.[1] || '').toLowerCase();
  return /^(image|audio|video)\//.test(ct) ? ct : null;
}

/** 媒体大类：image / audio / video */
function mediaKind(ct) {
  return ct.split('/')[0];
}

/** 从响应头取 Content-Length（无或非法返回 0） */
function headerLength(headers) {
  const entry = Object.entries(headers || {}).find(([k]) => k.toLowerCase() === 'content-length');
  const n = parseInt(entry?.[1] || '', 10);
  return Number.isFinite(n) ? n : 0;
}

/** 超限媒体「直接下载」：重新请求并流式写入选定的文件 */
async function downloadMediaResponse() {
  const r = currentResponse;
  const m = r?.media;
  if (!r || !m) return;

  let name = '';
  try { name = decodeURIComponent(new URL(r.url).pathname.split('/').pop() || ''); } catch {}
  if (!name.includes('.')) {
    const sub = m.contentType.split('/')[1]?.split(';')[0] || 'bin';
    name = (name || 'response') + '.' + sub;
  }
  const filePath = await ipcRenderer.invoke('save-file-dialog', {
    defaultPath: name,
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });
  if (!filePath) return;
  try {
    await ipcRenderer.invoke('download-request', {
      url: r.url,
      method: m.request?.method || 'GET',
      headers: m.request?.headers || {},
      body: m.request?.body,
      ignoreSsl: m.request?.ignoreSsl || false,
      timeout: appData.settings?.timeout || 30000,
      filePath
    });
    showToast(t('res.mediaDownloaded'));
  } catch {
    showToast(t('res.mediaDownloadFailed'));
  }
}

export async function sendRequest() {
  // 请求进行中：点击按钮 = 取消本次请求（取消后再次点击才会重新发送）
  if (isRequesting) {
    await cancelActiveRequest();
    return;
  }

  const method = methodSelect.value;
  const url = urlInput.value.trim();
  if (!url) {
    // 统一使用 showToast，避免 Electron 模态对话框焦点丢失
    showToast(t('msg.pleaseEnterUrl'));
    urlInput.focus();
    return;
  }

  // 全集（含未勾选行，用于保存历史/集合，保留勾选状态）
  const allParams = getKVItems('params');
  const allHeaders = getKVItems('headers');
  // 仅勾选中的参数/请求头参与本次请求（未勾选行保留在界面但不发送，类似 Postman）
  const params = allParams.filter(p => p.enabled);
  const headers = allHeaders.filter(h => h.enabled);
  const body = bodyEditor.value;
  const bType = bodyType.value;

  let finalUrl;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    finalUrl = url;
  } else if (url.includes(':443')) {
    finalUrl = 'https://' + url;
  } else {
    finalUrl = 'http://' + url;
  }
  if (params.length > 0) {
    const urlObj = new URL(finalUrl);
    params.forEach(p => urlObj.searchParams.set(p.key, p.value));
    finalUrl = urlObj.toString();
  }

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

  const proxySetting = appData.settings?.proxy;
  const bypass = shouldBypassProxy(finalUrl, proxySetting?.noProxy);
  // 从代理列表中找到选中项的 URL（兼容旧格式 proxy.url）
  let proxyUrl = '';
  if (proxySetting?.enabled && !bypass) {
    if (Array.isArray(proxySetting.list)) {
      const selected = proxySetting.list.find(p => p.id === proxySetting.selected);
      proxyUrl = selected ? selected.url : '';
    } else if (proxySetting.url) {
      proxyUrl = proxySetting.url;
    }
  }
  // 代理 URL 使用时补全协议前缀（用户可能只输入 host:port；已带任意协议前缀则保持原样）
  if (proxyUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(proxyUrl)) {
    proxyUrl = 'http://' + proxyUrl;
  }
  const ignoreSsl = appData.settings?.ignoreSsl || false;

  const reqHeaders = {};
  headers.forEach(h => reqHeaders[h.key] = h.value);

  // multipart/form-data：由字段表构造 Buffer 请求体（含文件），Content-Type 携带 boundary
  let requestBody = body;
  let multipartFields = null;
  let formFields = null;
  if (bType === 'multipart') {
    multipartFields = getMultipartItems().filter(f => f.enabled && f.key);
    try {
      const built = buildMultipartBody(multipartFields);
      reqHeaders['Content-Type'] = built.contentType;
      requestBody = built.buffer;
    } catch (err) {
      showToast(err.message || String(err));
      return;
    }
  } else if (bType === 'form') {
    // x-www-form-urlencoded：由字段表构造（勾选行参与发送）
    formFields = getKVItems('form').filter(f => f.enabled && f.key);
    requestBody = buildUrlEncodedBody(formFields);
    if (requestBody) reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (bType === 'json' && body) {
    reqHeaders['Content-Type'] = 'application/json';
  } else if (bType === 'text' && body) {
    reqHeaders['Content-Type'] = 'text/plain';
  }

  const startTime = Date.now();
  const requestId = 'req-' + startTime + '-' + Math.floor(Math.random() * 1e6);
  activeRequestId = requestId;
  setRequesting(true, startTime);
  responseStatus.textContent = t('res.sending');
  responseStatus.className = 'response-status';
  responseTime.textContent = '';
  responseSize.textContent = '';
  // 响应区加载态：旋转指示器 + 文案
  responseBody.innerHTML = `
    <div class="response-loading">
      <span class="spinner" aria-hidden="true"></span>
      <span>${escapeHtml(t('res.sendingRequest'))}</span>
    </div>`;

  // 检测是否为流式请求
  if (isStreamRequest(body, reqHeaders)) {
    await sendStreamRequest({ method, url: finalUrl, headers: reqHeaders, body, ignoreSsl, proxyUrl, proxySetting, startTime });
    return;
  }

  try {
    // 同步代理和 SSL 设置到主进程
    await ipcRenderer.invoke('set-proxy', proxyUrl, proxySetting?.noProxy || '');
    await ipcRenderer.invoke('set-ignore-ssl', ignoreSsl);

    const result = await ipcRenderer.invoke('http-request', {
      method,
      url: finalUrl,
      headers: reqHeaders,
      body: requestBody,
      ignoreSsl,
      requestId,
      timeout: appData.settings?.timeout || 30000
    });

    // 用户主动取消（主进程返回标识）或已被新一轮请求取代：忽略迟到的响应
    if (!result || result.cancelled || activeRequestId !== requestId) return;

    const duration = Date.now() - startTime;
    // 媒体响应（图片/音频/视频）：主进程落盘临时文件后返回路径，超限（按响应头判断）只返回元信息
    // 优先用主进程返回的 mediaContentType：响应头 content-type 不是媒体（octet-stream 等）时，
    // 主进程会按魔数嗅探出实际类型
    const mType = result.mediaContentType || mediaType(result.headers);
    let media = null;
    let respBody = result.body;
    let size;
    if (mType) {
      media = { contentType: mType, kind: mediaKind(mType), tooLarge: !!result.mediaTooLarge };
      // 「直接下载」需要重放本次请求
      media.request = { method, headers: reqHeaders, body: requestBody, ignoreSsl };
      if (result.mediaTooLarge) {
        respBody = '';
        size = result.mediaSize || headerLength(result.headers);
      } else {
        // 内容在主进程临时文件中，body 不进渲染进程
        media.mediaFile = result.mediaFile || null;
        respBody = '';
        size = result.mediaSize || headerLength(result.headers);
      }
    } else {
      size = new Blob([result.body]).size;
    }
    setCurrentResponse({
      status: result.statusCode,
      statusText: result.statusMessage,
      headers: result.headers,
      body: respBody,
      ...(media ? { media } : {}),
      duration,
      size,
      url: finalUrl,
      proxyUrl
    });
    displayResponse();
    // 媒体内容不写入历史（体积大且 base64 无意义）
    saveToHistory(method, url, allParams, allHeaders, requestBody && typeof requestBody === 'string' ? requestBody : body, bType, result.statusCode, duration, size, media ? undefined : result.body, result.headers, proxyUrl, multipartFields, formFields);
  } catch (err) {
    // 已被取消或已被新一轮请求取代：不展示错误卡片
    if (activeRequestId !== requestId || isCancelledError(err)) return;
    responseStatus.textContent = t('res.error');
    responseStatus.className = 'response-status error';
    responseTime.textContent = '';
    responseSize.textContent = '';
    responseBody.innerHTML = renderErrorCard(err, ignoreSsl);
  } finally {
    if (activeRequestId === requestId) {
      activeRequestId = null;
      setRequesting(false);
    }
  }
}

/**
 * 流式请求处理：SSE 事件监听、打字机渲染、thinking 块支持
 */
async function sendStreamRequest({ method, url, headers, body, ignoreSsl, proxyUrl, proxySetting, startTime }) {
  // 同步代理和 SSL 设置
  await ipcRenderer.invoke('set-proxy', proxyUrl, proxySetting?.noProxy || '');
  await ipcRenderer.invoke('set-ignore-ssl', ignoreSsl);

  // 生成 streamId 并提前注册 IPC 监听（避免 stream-start 事件丢失）
  const streamId = 'stream-' + Date.now();
  activeStreamId = streamId;

  // 流式状态
  let streamHeaders = null;
  let streamStatus = null;
  let streamStatusText = '';
  let contentText = '';       // 累积的正文内容
  let thinkingText = '';      // 累积的思考内容
  let rawSSEText = '';        // 原始 SSE 文本
  let totalSize = 0;
  let isStreaming = true;
  let isThinking = false;     // 当前是否在 thinking 阶段
  let hasThinking = false;    // 是否出现过 thinking
  let streamError = null;
  let rafId = null;
  let needsRender = false;

  // 显示流式状态
  responseStatus.textContent = t('res.streaming');
  responseStatus.className = 'response-status streaming';
  responseTime.textContent = '';
  responseSize.textContent = '0 B';

  // 确保 pretty 标签页激活
  document.querySelectorAll('.resp-tab-btn').forEach(btn => btn.classList.remove('active'));
  const prettyBtn = document.querySelector('.resp-tab-btn[data-resp-tab="pretty"]');
  if (prettyBtn) prettyBtn.classList.add('active');

  // 初始化流式容器
  responseBody.innerHTML = '<div class="stream-container"></div>';
  const streamContainer = responseBody.querySelector('.stream-container');

  /** 渲染流式内容 */
  function renderStream() {
    if (!isStreaming && !needsRender) return;
    needsRender = false;

    let html = '';

    // Thinking 块
    if (hasThinking) {
      html += `<div class="thinking-block ${isStreaming ? 'thinking-active' : 'thinking-done'}">
        <div class="thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <span class="thinking-icon">\u{1F4AD}</span>
          <span class="thinking-label">${t('res.thinking')}</span>
          <span class="thinking-toggle">${isStreaming ? '' : '\u25B6'}</span>
        </div>
        <div class="thinking-content"><code>${escapeHtml(thinkingText)}</code>${isStreaming && isThinking ? '<span class="stream-cursor"></span>' : ''}</div>
      </div>`;
    }

    // 正文内容
    if (contentText || (!hasThinking && isStreaming)) {
      html += `<div class="stream-content">
        <code>${escapeHtml(contentText)}</code>
        ${isStreaming && !isThinking ? '<span class="stream-cursor"></span>' : ''}
      </div>`;
    }

    streamContainer.innerHTML = html;

    // 自动滚动到底部
    const respContent = responseBody.closest('.response-content');
    if (respContent) {
      respContent.scrollTop = respContent.scrollHeight;
    }
  }

  // 请求渲染（节流）
  function scheduleRender() {
    needsRender = true;
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        renderStream();
      });
    }
  }

  // IPC 事件监听（提前注册，避免丢失 stream-start）
  function onStreamStart(event, sid, data) {
    if (sid !== streamId) return;
    streamStatus = data.statusCode;
    streamStatusText = data.statusMessage;
    streamHeaders = data.headers;

    responseStatus.textContent = `${streamStatus} ${streamStatusText}`;
    responseStatus.className = streamStatus >= 400 ? 'response-status error streaming' : 'response-status streaming';
  }

  function onStreamChunk(event, sid, chunk) {
    if (sid !== streamId) return;
    rawSSEText += chunk;
    totalSize += new Blob([chunk]).size;
    responseSize.textContent = formatBytes(totalSize);

    // 解析 SSE 数据
    const parsed = parseSSEChunks(chunk);
    for (const item of parsed) {
      if (item.type === 'content') {
        contentText += item.text;
        isThinking = false;
      } else if (item.type === 'thinking') {
        thinkingText += item.text;
        isThinking = true;
        hasThinking = true;
      } else if (item.type === 'done') {
        // [DONE] 标记
      } else if (item.type === 'error') {
        streamError = item.text;
      }
    }

    scheduleRender();
  }

  function onStreamEnd(event, sid) {
    if (sid !== streamId) return;
    finishStream();
  }

  function onStreamError(event, sid, errMsg) {
    if (sid !== streamId) return;
    streamError = errMsg;
    finishStream();
  }

  // 先注册监听，再发起请求
  ipcRenderer.on('stream-start', onStreamStart);
  ipcRenderer.on('stream-chunk', onStreamChunk);
  ipcRenderer.on('stream-end', onStreamEnd);
  ipcRenderer.on('stream-error', onStreamError);

  // 清理函数
  function cleanup() {
    ipcRenderer.removeListener('stream-start', onStreamStart);
    ipcRenderer.removeListener('stream-chunk', onStreamChunk);
    ipcRenderer.removeListener('stream-end', onStreamEnd);
    ipcRenderer.removeListener('stream-error', onStreamError);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  streamCleanup = cleanup;

  // 取消时的收尾：定格已接收内容（无内容时显示取消提示）
  streamCancelHandler = () => {
    isStreaming = false;
    if (contentText || thinkingText) {
      renderFinalStreamView(contentText, thinkingText);
    } else {
      responseBody.innerHTML = `<code>${escapeHtml(t('res.cancelledHint'))}</code>`;
    }
  };

  // 启动流式请求（传入 streamId 使主进程复用）
  try {
    await ipcRenderer.invoke('http-stream-request', {
      streamId,
      method,
      url,
      headers,
      body,
      ignoreSsl
    });
  } catch (err) {
    // invoke 本身出错（如主进程 handler 抛异常）
    cleanup();
    activeStreamId = null;
    streamCleanup = null;
    streamCancelHandler = null;
    setRequesting(false);
    const duration = Date.now() - startTime;
    responseStatus.textContent = t('res.error');
    responseStatus.className = 'response-status error';
    responseTime.textContent = `${duration} ms`;
    responseBody.innerHTML = renderErrorCard(err, ignoreSsl);
    return;
  }

  function finishStream() {
    isStreaming = false;
    activeStreamId = null;
    streamCancelHandler = null;
    setRequesting(false);

    // 移除 IPC 监听器
    cleanup();

    const duration = Date.now() - startTime;

    if (streamError) {
      responseStatus.textContent = t('res.error');
      responseStatus.className = 'response-status error';
      responseTime.textContent = `${duration} ms`;
      responseSize.textContent = formatBytes(totalSize);
      responseBody.innerHTML = renderErrorCard(new Error(streamError), ignoreSsl);
      return;
    }

    responseStatus.textContent = `${streamStatus || ''} ${streamStatusText || ''}`;
    responseStatus.className = streamStatus >= 400 ? 'response-status error' : 'response-status';
    responseTime.textContent = `${duration} ms`;
    responseSize.textContent = formatBytes(totalSize);

    // 保存完整响应用于后续 Tab 切换
    setCurrentResponse({
      status: streamStatus,
      statusText: streamStatusText,
      headers: streamHeaders,
      body: rawSSEText,
      duration,
      size: totalSize,
      url: url,
      proxyUrl,
      // 流式专属字段
      _streamParsed: {
        content: contentText,
        thinking: thinkingText,
        raw: rawSSEText
      }
    });

    // 最终渲染：使用高亮 + 行号
    renderFinalStreamView(contentText, thinkingText);

    const bType = bodyType.value;
    const params = getKVItems('params');
    saveToHistory(methodSelect.value, urlInput.value.trim(), params, getKVItems('headers'), bodyEditor.value, bType, streamStatus, duration, totalSize, rawSSEText, streamHeaders, proxyUrl);
  }
}

/**
 * 流式结束后最终渲染：高亮 + 行号 + thinking 可折叠
 */
function renderFinalStreamView(content, thinking) {
  let html = '';

  // Thinking 块（折叠）
  if (thinking) {
    html += `<div class="thinking-block thinking-done collapsed">
      <div class="thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <span class="thinking-icon">\u{1F4AD}</span>
        <span class="thinking-label">${t('res.thinking')}</span>
        <span class="thinking-toggle">\u25B6</span>
      </div>
      <div class="thinking-content"><code>${addLineNumbers(escapeHtml(thinking))}</code></div>
    </div>`;
  }

  // 正文内容（语法高亮 + 行号；超大内容同样降级为纯文本分块渲染）
  if (content) {
    if (content.length > PLAIN_RENDER_LIMIT) {
      responseBody.innerHTML = html;
      const wrap = document.createElement('div');
      wrap.className = 'stream-final-content';
      wrap.appendChild(renderPlainBody(content));
      responseBody.appendChild(wrap);
      return;
    }
    let highlighted;
    try {
      const json = JSON.parse(content);
      const formatted = JSON.stringify(json, null, 2);
      highlighted = highlightJson(formatted);
    } catch {
      highlighted = escapeHtml(content);
    }
    html += `<div class="stream-final-content"><code>${addLineNumbers(highlighted)}</code></div>`;
  }

  responseBody.innerHTML = html;
}

export function displayResponse() {
  if (!currentResponse) return;
  const { status, statusText, body, duration, size } = currentResponse;
  responseStatus.textContent = `${status} ${statusText}`;
  responseStatus.className = status >= 400 ? 'response-status error' : 'response-status';
  responseTime.textContent = `${duration} ms`;
  responseSize.textContent = formatBytes(size);

  // 媒体响应：自动切到 Preview 展示 / 播放（点击页签会触发切换与渲染）
  const activeTab = document.querySelector('.resp-tab-btn.active')?.dataset.respTab || 'pretty';
  if (currentResponse.media && (activeTab === 'pretty' || activeTab === 'raw')) {
    document.querySelector('.resp-tab-btn[data-resp-tab="preview"]')?.click();
    return;
  }
  showResponseTab(activeTab);
}

// 语法高亮与行号会为每个 token / 每行生成 DOM 节点，大响应体可达数十万节点，
// 一次性渲染会阻塞主线程数秒（点击历史记录切换标签即触发）；超过阈值降级为纯文本渲染
const PLAIN_RENDER_LIMIT = 200 * 1024;

/**
 * 纯文本渲染超大响应体：按行分块 + content-visibility:auto，
 * 视口外的块跳过布局与绘制（65k 行文本一次性布局实测阻塞主线程约 400ms，分块后约 1ms）
 */
function renderPlainBody(text) {
  const CHUNK_LINES = 500;
  const lines = text.split('\n');
  const code = document.createElement('code');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    const chunk = document.createElement('div');
    chunk.className = 'plain-chunk';
    chunk.textContent = lines.slice(i, i + CHUNK_LINES).join('\n') + (i + CHUNK_LINES < lines.length ? '\n' : '');
    frag.appendChild(chunk);
  }
  code.appendChild(frag);
  return code;
}

export function showResponseTab(tab) {
  if (!currentResponse) return;

  // 释放旧的 blob URL
  const oldFrame = responseBody.querySelector('iframe, webview');
  if (oldFrame && oldFrame.src && oldFrame.src.startsWith('blob:')) {
    URL.revokeObjectURL(oldFrame.src);
  }

  let content = currentResponse.body;

  // 媒体响应（图片/音频/视频）：Preview 经临时文件展示/播放，超限提示直接下载；Pretty/Raw 无内容，仅 Headers 有信息
  if (currentResponse.media && tab !== 'headers') {
    responseBody.style.display = '';
    const m = currentResponse.media;
    if (tab === 'preview') {
      if (m.tooLarge) {
        responseBody.innerHTML = `
          <div class="response-media">
            <p>${escapeHtml(t('res.mediaTooLargeHint'))}</p>
            <button class="btn-media-download" id="btn-media-download">${escapeHtml(t('res.mediaDownload'))}</button>
          </div>`;
        document.getElementById('btn-media-download')?.addEventListener('click', downloadMediaResponse);
      } else if (!m.mediaFile) {
        // 会话恢复的媒体标签不带内容
        responseBody.innerHTML = `<div class="response-media"><p>${escapeHtml(t('res.mediaNotPersisted'))}</p></div>`;
      } else {
        const src = 'file:///' + m.mediaFile.replace(/\\/g, '/');
        if (m.kind === 'image') {
          responseBody.innerHTML = `<img src="${src}" style="max-width:100%;border-radius:4px;" alt="">`;
        } else if (m.kind === 'audio') {
          responseBody.innerHTML = `<audio controls src="${src}" style="width:100%;"></audio>`;
        } else {
          responseBody.innerHTML = `<video controls src="${src}" style="max-width:100%;border-radius:4px;"></video>`;
        }
      }
    } else {
      responseBody.innerHTML = `<code>${escapeHtml(t('res.mediaPreviewHint'))}</code>`;
    }
    return;
  }

  if (tab === 'pretty') {
    responseBody.style.display = '';

    // 流式响应：优先使用解析后的内容
    if (currentResponse._streamParsed) {
      const { content, thinking } = currentResponse._streamParsed;
      renderFinalStreamView(content, thinking);
      return;
    }

    // 先尝试 JSON 格式化（解析开销低，便于以格式化后的长度判断渲染方式）
    let formatted = null;
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2);
    } catch {}

    // 超大响应体：纯文本分块渲染，避免海量高亮/行号节点与整段布局卡死界面
    if ((formatted ?? content).length > PLAIN_RENDER_LIMIT) {
      responseBody.innerHTML = `<div class="plain-render-hint">${escapeHtml(t('res.plainRenderHint'))}</div>`;
      responseBody.appendChild(renderPlainBody(formatted ?? content));
      return;
    }

    let highlighted;
    if (formatted !== null) {
      highlighted = highlightJson(formatted);
    } else {
      // 非 JSON，检测是否为 XML
      const trimmed = content.trim();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<') && /<\/[\w:.-]+>/.test(trimmed)) {
        highlighted = highlightXml(content);
      } else {
        highlighted = escapeHtml(content);
      }
    }
    responseBody.innerHTML = `<code>${addLineNumbers(highlighted)}</code>`;
  } else if (tab === 'raw') {
    responseBody.style.display = '';
    responseBody.innerHTML = `<code>${escapeHtml(content)}</code>`;
  } else if (tab === 'preview') {
    const headers = currentResponse.headers || {};
    const contentTypeEntry = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type');
    const contentType = (contentTypeEntry?.[1] || '').toLowerCase();

    if (contentType.includes('text/html')) {
      responseBody.style.display = 'block';
      let htmlContent = content;

      // 注入 <base> 标签，使相对路径资源能正确加载
      if (currentResponse.url && !htmlContent.toLowerCase().includes('<base')) {
        try {
          const baseUrl = new URL(currentResponse.url);
          baseUrl.hash = '';
          baseUrl.search = '';
          const baseTag = `<base href="${escapeHtml(baseUrl.toString())}">`;
          if (/<head[^>]*>/i.test(htmlContent)) {
            htmlContent = htmlContent.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
          } else if (/<html[^>]*>/i.test(htmlContent)) {
            htmlContent = htmlContent.replace(/(<html[^>]*>)/i, `$1<head>${baseTag}</head>`);
          } else {
            htmlContent = `<head>${baseTag}</head>` + htmlContent;
          }
        } catch {}
      }

      responseBody.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;min-height:500px;border:none;background:#fff;display:block;border-radius:4px;';
      iframe.setAttribute('allow', 'fullscreen');
      iframe.srcdoc = htmlContent;
      responseBody.appendChild(iframe);
    } else if (contentType.includes('image/')) {
      responseBody.style.display = '';
      responseBody.innerHTML = `<img src="data:${contentType};base64,${btoa(content)}" style="max-width:100%;border-radius:4px;">`;
    } else {
      responseBody.style.display = '';
      responseBody.innerHTML = `<code>${escapeHtml(content.substring(0, 5000))}${content.length > 5000 ? '...' : ''}</code>`;
    }
  } else if (tab === 'headers') {
    responseBody.style.display = '';
    const headers = currentResponse.headers || {};
    const headerRows = Object.entries(headers)
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([key, value]) => {
        return `<div class="resp-header-row">
          <span class="resp-header-key">${escapeHtml(key)}</span>
          <span class="resp-header-value">${escapeHtml(String(value))}</span>
        </div>`;
      }).join('');
    responseBody.innerHTML = `<div class="resp-headers-table">${headerRows || `<div class="resp-header-row"><span class="resp-header-key">${t('res.noHeaders')}</span></div>`}</div>`;
  }
}

/**
 * 当前请求若是合集中已保存的请求，返回它的名称与归属。
 * 按 id 在合集中实时查找（而不是用缓存的名称），这样请求被重命名后再发送，历史里也是新名称。
 */
function findSavedRequestInfo() {
  // 集合请求用自身 id；从历史打开的请求 reqData 里带的是原请求的 requestId
  const id = currentRequest?.requestId || currentRequest?.id;
  if (!id) return null;
  for (const coll of appData.collections || []) {
    const req = coll.requests?.find(r => r.id === id);
    if (req) return { name: req.name, requestId: req.id, collectionId: coll.id };
  }
  return null;
}

export function saveToHistory(method, url, params, headers, body, bodyType, status, duration, size, responseBody, responseHeaders, proxyUrl, multipart, form) {
  const id = 'h-' + Date.now();
  const saved = findSavedRequestInfo();
  appData.history.unshift({
    id,
    // 合集里已保存的请求：历史中展示请求名称，而不是 URL
    ...(saved ? { name: saved.name, requestId: saved.requestId, collectionId: saved.collectionId } : {}),
    method,
    url,
    params,
    headers,
    body,
    bodyType,
    ...(multipart ? { multipart } : {}),
    ...(form ? { form } : {}),
    status,
    duration,
    size,
    // 超大响应体不持久化：避免历史数据文件膨胀后，每次保存都全量序列化大文件造成界面卡顿
    ...(responseBody && responseBody.length > 1024 * 1024 ? {} : { responseBody }),
    responseHeaders,
    proxyUrl,
    timestamp: Date.now()
  });
  if (appData.history.length > 200) appData.history = appData.history.slice(0, 200);
  saveData(appData);
  if (currentView === 'history') {
    if (window.__renderSidebar) window.__renderSidebar();
  }
}

/**
 * 解析错误并生成友好的错误卡片 HTML
 */
function renderErrorCard(err, ignoreSsl) {
  const msg = err.message || String(err);
  const { title, detail, hints } = parseError(msg, ignoreSsl);

  const hintsHtml = hints.map(h =>
    `<li>${escapeHtml(h)}</li>`
  ).join('');

  return `<div class="error-card">
    <div class="error-card-icon">&#9888;</div>
    <div class="error-card-body">
      <div class="error-card-title">${escapeHtml(title)}</div>
      <div class="error-card-detail">${escapeHtml(detail)}</div>
      ${hints.length ? `<ul class="error-card-hints">${hintsHtml}</ul>` : ''}
    </div>
  </div>`;
}

/**
 * 根据错误信息分类，返回可读的标题、详情和建议
 */
function parseError(msg, ignoreSsl) {
  // SSL / 证书错误
  if (/certificate has expired/i.test(msg)) {
    return {
      title: t('err.sslExpired'),
      detail: t('err.sslExpiredDetail'),
      hints: ignoreSsl
        ? [t('err.sslExpiredHint3'), t('err.sslExpiredHint4')]
        : [t('err.sslExpiredHint1'), t('err.sslExpiredHint2')]
    };
  }
  if (/self.signed certificate/i.test(msg)) {
    return {
      title: t('err.selfSigned'),
      detail: t('err.selfSignedDetail'),
      hints: ignoreSsl
        ? [t('err.selfSignedHint2')]
        : [t('err.selfSignedHint1')]
    };
  }
  if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(msg) || /unable to verify the first certificate/i.test(msg)) {
    return {
      title: t('err.incompleteChain'),
      detail: t('err.incompleteChainDetail'),
      hints: [t('err.incompleteChainHint1'), t('err.incompleteChainHint2')]
    };
  }
  if (/certificate/i.test(msg) || /ssl|tls/i.test(msg)) {
    return {
      title: t('err.sslTlsFailed'),
      detail: msg,
      hints: ignoreSsl
        ? [t('err.sslTlsHint2')]
        : [t('err.sslTlsHint1')]
    };
  }

  // 连接错误
  if (/ECONNREFUSED/i.test(msg)) {
    return {
      title: t('err.connRefused'),
      detail: t('err.connRefusedDetail'),
      hints: [t('err.connRefusedHint1'), t('err.connRefusedHint2')]
    };
  }
  if (/ENOTFOUND/i.test(msg)) {
    return {
      title: t('err.dnsFailed'),
      detail: t('err.dnsFailedDetail'),
      hints: [t('err.dnsFailedHint1'), t('err.dnsFailedHint2'), t('err.dnsFailedHint3')]
    };
  }
  if (/ECONNRESET/i.test(msg) || /socket hang up/i.test(msg)) {
    return {
      title: t('err.connReset'),
      detail: t('err.connResetDetail'),
      hints: [t('err.connResetHint1'), t('err.connResetHint2'), t('err.connResetHint3')]
    };
  }
  if (/ETIMEDOUT/i.test(msg) || /timeout/i.test(msg)) {
    return {
      title: t('err.timeout'),
      detail: t('err.timeoutDetail'),
      hints: [t('err.timeoutHint1'), t('err.timeoutHint2'), t('err.timeoutHint3')]
    };
  }
  if (/WRONG_VERSION_NUMBER/i.test(msg)) {
    return {
      title: t('err.wrongVersion'),
      detail: t('err.wrongVersionDetail'),
      hints: [t('err.wrongVersionHint1'), t('err.wrongVersionHint2')]
    };
  }
  if (/PROXY/i.test(msg)) {
    return {
      title: t('err.proxyFailed'),
      detail: msg,
      hints: [t('err.proxyFailedHint1'), t('err.proxyFailedHint2'), t('err.proxyFailedHint3')]
    };
  }

  // 通用错误兜底
  const cleanMsg = msg.replace(/^Error invoking remote method[^:]*:\s*/i, '');
  return {
    title: t('err.requestFailed'),
    detail: cleanMsg,
    hints: []
  };
}
