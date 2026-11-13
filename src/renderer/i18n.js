/**
 * 国际化 (i18n) 模块
 * 支持中文（简/繁）/ 英文 / 日文切换，通过 data-i18n 属性自动更新 DOM 文本
 */
import { appData, saveData } from './store.js';

const dictionaries = {
  en: {
    // 侧边栏
    'sidebar.history': 'History',
    'sidebar.collections': 'Collections',
    'sidebar.search': 'Search APIs...',
    'sidebar.newCollection': '+ Create a Collection',
    'sidebar.newRequest': 'New Request',
    'sidebar.import': 'Import',
    'sidebar.settings': 'Settings',
    'sidebar.toggleTheme': 'Toggle Theme',

    // URL 栏
    'url.placeholder': 'Enter request URL',
    'url.send': 'Send',
    'url.cancel': 'Cancel',
    'url.curl': 'cURL',
    'url.save': 'Save',
    'url.noProxy': 'No Proxy',
    'url.proxySettings': 'Proxy Settings...',

    // 请求面板
    'req.params': 'Params',
    'req.headers': 'Headers',
    'req.body': 'Body',
    'req.key': 'Key',
    'req.value': 'Value',
    'req.description': 'Description',
    'req.addParam': '+ Add Param',
    'req.addHeader': '+ Add Header',
    'req.bodyType.none': 'none',
    'req.bodyType.json': 'JSON',
    'req.bodyType.text': 'text',
    'req.bodyType.form': 'x-www-form-urlencoded',
    'req.bodyType.multipart': 'multipart/form-data',
    'req.beautify': 'Beautify',
    'req.bodyPlaceholder': 'Request body...',

    // 响应面板
    'res.pretty': 'Pretty',
    'res.raw': 'Raw',
    'res.preview': 'Preview',
    'res.headers': 'Headers',
    'res.copy': 'Copy',
    'find.placeholder': 'Find',
    'find.prev': 'Previous match',
    'find.next': 'Next match',
    'find.close': 'Close',
    'tabs.newRequest': 'New Request',
    'tabs.close': 'Close tab',
    'tabs.unsavedTitle': 'Unsaved Changes',
    'tabs.unsavedMessage': 'This request has unsaved changes. Save before closing?',
    'tabs.discard': "Don't Save",
    'tabs.copyBadge': 'Copy',
    'raw.title': 'Raw HTTP Request',
    'raw.tooltip': 'View the raw HTTP request that will actually be sent',
    'msg.invalidUrl': 'Invalid URL',
    'multipart.addField': '+ Add Field',
    'multipart.selectFile': 'Select File',
    'multipart.noFile': 'No file selected',
    'multipart.fileReadError': 'Failed to read file',
    'res.copyResponse': 'Copy Response',
    'res.clickSend': 'Click Send to get a response',
    'res.emptyTitle': 'No response yet',
    'res.sending': 'Sending...',
    'res.sendingRequest': 'Sending request...',
    'res.error': 'Error',
    'res.noHeaders': 'No headers',
    'res.mediaPreviewHint': 'Media response: use Preview to view or play it, and Headers for response headers.',
    'res.plainRenderHint': 'Large response body rendered as plain text (syntax highlight and line numbers disabled to keep the UI responsive).',
    'res.mediaTooLargeHint': 'Media response exceeds the 20MB limit and is not displayed.',
    'res.mediaDownload': 'Download directly',
    'res.mediaDownloaded': 'Download complete!',
    'res.mediaDownloadFailed': 'Download failed',
    'res.mediaNotPersisted': 'Media content is not persisted across sessions and history. Resend the request to view it.',
    'res.streaming': 'Streaming...',
    'res.thinking': 'Thinking',
    'res.cancelled': 'Cancelled',
    'res.cancelledHint': 'Request cancelled.',
    'res.proxy': 'proxyed',
    'res.direct': 'noproxy',

    // 弹窗 - 集合
    'modal.createCollection': 'Create Collection',
    'modal.editCollection': 'Edit Collection',
    'modal.collectionName': 'Collection name',
    'modal.collectionTags': 'Tags (comma separated)',
    'modal.cancel': 'Cancel',
    'modal.create': 'Create',
    'modal.save': 'Save',
    'modal.move': 'Move',

    // 弹窗 - 重命名
    'modal.renameRequest': 'Rename Request',
    'modal.requestName': 'Request name',

    // 弹窗 - 保存请求
    'modal.saveRequest': 'Save Request',

    // 弹窗 - 标签
    'modal.manageTags': 'Manage Tags',
    'modal.newTagName': 'New tag name',
    'modal.add': 'Add',

    // 弹窗 - 移动
    'modal.moveToCollection': 'Move to Collection',
    'modal.saveToCollection': 'Save to Collection',

    // 弹窗 - 导入
    'modal.importCurl': 'Import cURL',
    'modal.curlPlaceholder': 'Paste curl command here...',
    'modal.parseImport': 'Parse & Import',
    'modal.importPostman': 'Import from Postman',
    'modal.postmanHint': '{n} requests will be imported from this file.',
    'modal.postmanMultiHint': '{n} collections will be created with {m} requests in total.',
    'modal.import': 'Import',

    // 弹窗 - 设置
    'modal.settings': 'Settings',
    'settings.proxy': 'Proxy',
    'settings.enableProxy': 'Enable Proxy',
    'settings.proxyNamePlaceholder': 'Name',
    'settings.proxyUrlPlaceholder': 'proxy.example.com:8080',
    'settings.addProxy': 'Add',
    'settings.deleteProxy': 'Delete',
    'settings.proxyFormat': 'Format: host:port, http(s)://host:port or socks5://host:port (socks4/4a/5/5h supported)',
    'settings.noProxy': 'NO_PROXY',
    'settings.noProxyHint': 'Comma-separated host patterns, supports * wildcard (e.g. *.local)',
    'settings.ssl': 'SSL',
    'settings.ignoreSsl': 'Ignore SSL Certificate Verification',
    'settings.sslHint': 'Skip HTTPS certificate verification (for self-signed cert dev environments)',
    'settings.requestDefaults': 'Request Defaults',
    'settings.defaultTimeout': 'Default Timeout (ms)',
    'settings.language': 'Language',
    'settings.about': 'About',
    'settings.version': 'Version',

    // 右键菜单
    'ctx.duplicate': 'Duplicate',
    'ctx.rename': 'Rename',
    'ctx.addTag': 'Add Tag',
    'ctx.moveTo': 'Move to...',
    'ctx.delete': 'Delete',
    'ctx.saveToCollection': 'Save to Collection',
    'ctx.deleteSelected': 'Delete Selected',
    'ctx.deleteGroup': 'Delete All Records of This Day',
    'ctx.importPostman': 'Import from Postman...',
    'ctx.exportPostman': 'Export to Postman...',
    'ctx.exportAllPostman': 'Export All to Postman...',

    // JS 中的文本
    'msg.pleaseEnterUrl': 'Please enter a URL',
    'msg.createCollectionFirst': 'Create a collection first!',
    'msg.saved': 'Saved!',
    'msg.updated': 'Updated!',
    'msg.savedToCollection': 'Saved to collection!',
    'msg.beautifyJsonOnly': 'Beautify only works for JSON body type',
    'msg.invalidJson': 'Invalid JSON',
    'msg.parseCurlFailed': 'Failed to parse curl command: ',
    'msg.pleasePasteCurl': 'Please paste a curl command',
    'msg.deleteCollectionConfirm': 'Delete this collection?',
    'msg.postmanReadFailed': 'Failed to read the file',
    'msg.postmanInvalid': 'Not a valid Postman collection file',
    'msg.postmanEmpty': 'No requests found in the file',
    'msg.imported': 'Imported!',
    'msg.exported': 'Exported!',
    'msg.exportFailed': 'Export failed',

    // 日期
    'date.today': 'Today',
    'date.yesterday': 'Yesterday',

    // 错误卡片
    'err.sslExpired': 'SSL Certificate Expired',
    'err.sslExpiredDetail': 'The target server\'s SSL certificate has expired. The connection was refused.',
    'err.sslExpiredHint1': 'Enable "Ignore SSL Certificate Verification" in Settings and retry.',
    'err.sslExpiredHint2': 'If this is a production environment, check if the server certificate needs renewal.',
    'err.sslExpiredHint3': 'SSL ignore is enabled but the error persists. Try restarting the app.',
    'err.sslExpiredHint4': 'If this is an internal test environment, contact the admin to update the certificate.',
    'err.selfSigned': 'Self-Signed Certificate Not Trusted',
    'err.selfSignedDetail': 'The target server uses a self-signed SSL certificate that cannot pass certificate chain verification.',
    'err.selfSignedHint1': 'Enable "Ignore SSL Certificate Verification" in Settings and retry.',
    'err.selfSignedHint2': 'SSL ignore is enabled but the error persists. Try restarting the app.',
    'err.incompleteChain': 'Incomplete Certificate Chain',
    'err.incompleteChainDetail': 'The certificate chain returned by the server is missing intermediate certificates, verification cannot be completed.',
    'err.incompleteChainHint1': 'Enable "Ignore SSL Certificate Verification" in Settings and retry.',
    'err.incompleteChainHint2': 'It is recommended to configure the server to complete the intermediate certificate chain.',
    'err.sslTlsFailed': 'SSL/TLS Handshake Failed',
    'err.sslTlsHint1': 'Enable "Ignore SSL Certificate Verification" in Settings and retry.',
    'err.sslTlsHint2': 'SSL ignore is enabled but the error persists. Try restarting the app.',
    'err.connRefused': 'Connection Refused',
    'err.connRefusedDetail': 'The target server refused the connection. The service may not be running or the port is incorrect.',
    'err.connRefusedHint1': 'Check if the target address and port are correct.',
    'err.connRefusedHint2': 'Confirm the target service is running.',
    'err.dnsFailed': 'DNS Resolution Failed',
    'err.dnsFailedDetail': 'Cannot resolve the target domain. Please check the URL.',
    'err.dnsFailedHint1': 'Check the URL spelling.',
    'err.dnsFailedHint2': 'Check network connection and DNS configuration.',
    'err.dnsFailedHint3': 'If using a proxy, confirm the proxy settings are correct.',
    'err.connReset': 'Connection Reset',
    'err.connResetDetail': 'The connection to the server was abnormally closed.',
    'err.connResetHint1': 'The server may have forcibly closed the connection.',
    'err.connResetHint2': 'Check request headers (e.g. Host) are correct.',
    'err.connResetHint3': 'If using a proxy, confirm the proxy settings are correct.',
    'err.timeout': 'Request Timeout',
    'err.timeoutDetail': 'No response received from the server within the specified time.',
    'err.timeoutHint1': 'Check network connectivity.',
    'err.timeoutHint2': 'Increase the timeout in Settings and retry.',
    'err.timeoutHint3': 'If using a proxy, confirm the proxy is reachable.',
    'err.wrongVersion': 'Protocol Version Error',
    'err.wrongVersionDetail': 'Possible protocol mismatch with the proxy server (e.g. accessing an HTTPS site via HTTP proxy).',
    'err.wrongVersionHint1': 'Check if the proxy address protocol is correct (usually http:// not https://).',
    'err.wrongVersionHint2': 'Confirm the proxy server supports CONNECT tunneling.',
    'err.proxyFailed': 'Proxy Connection Failed',
    'err.proxyFailedHint1': 'Check the proxy address is correct.',
    'err.proxyFailedHint2': 'Confirm the proxy service is running.',
    'err.proxyFailedHint3': 'If no proxy is needed, disable it in Settings.',
    'err.requestFailed': 'Request Failed',
    'err.saveDataFailed': 'Failed to save data - changes will not persist (storage not writable)',
    'err.loadDataFailed': 'Failed to read data file - started with empty data',
  },

  zh: {
    // 侧边栏
    'sidebar.history': '历史记录',
    'sidebar.collections': '集合',
    'sidebar.search': '搜索 API...',
    'sidebar.newCollection': '+ 新建集合',
    'sidebar.newRequest': '新建请求',
    'sidebar.import': '导入',
    'sidebar.settings': '设置',
    'sidebar.toggleTheme': '切换主题',

    // URL 栏
    'url.placeholder': '输入请求 URL',
    'url.send': '发送',
    'url.cancel': '取消',
    'url.curl': 'cURL',
    'url.save': '保存',
    'url.noProxy': '不使用代理',
    'url.proxySettings': '代理设置...',

    // 请求面板
    'req.params': '参数',
    'req.headers': '请求头',
    'req.body': '请求体',
    'req.key': '键',
    'req.value': '值',
    'req.description': '描述',
    'req.addParam': '+ 添加参数',
    'req.addHeader': '+ 添加请求头',
    'req.bodyType.none': '无',
    'req.bodyType.json': 'JSON',
    'req.bodyType.text': '文本',
    'req.bodyType.form': 'x-www-form-urlencoded',
    'req.bodyType.multipart': 'multipart/form-data',
    'req.beautify': '格式化',
    'req.bodyPlaceholder': '请求体内容...',

    // 响应面板
    'res.pretty': '格式化',
    'res.raw': '原始',
    'res.preview': '预览',
    'res.headers': '请求头',
    'res.copy': '复制',
    'find.placeholder': '查找',
    'find.prev': '上一个',
    'find.next': '下一个',
    'find.close': '关闭',
    'tabs.newRequest': '新请求',
    'tabs.close': '关闭标签',
    'tabs.unsavedTitle': '未保存的修改',
    'tabs.unsavedMessage': '该请求有未保存的修改，关闭前是否保存？',
    'tabs.discard': '不保存',
    'tabs.copyBadge': '副本',
    'raw.title': 'HTTP 原始请求报文',
    'raw.tooltip': '查看实际发送的 HTTP 原始请求报文',
    'msg.invalidUrl': '无效的 URL',
    'multipart.addField': '+ 添加字段',
    'multipart.selectFile': '选择文件',
    'multipart.noFile': '未选择文件',
    'multipart.fileReadError': '文件读取失败',
    'res.copyResponse': '复制响应',
    'res.clickSend': '点击发送按钮获取响应',
    'res.emptyTitle': '暂无响应',
    'res.sending': '发送中...',
    'res.sendingRequest': '正在发送请求...',
    'res.error': '错误',
    'res.noHeaders': '无请求头',
    'res.mediaPreviewHint': '媒体类型响应：请在 Preview 查看 / 播放，Headers 查看响应头。',
    'res.plainRenderHint': '响应体较大，已按纯文本渲染（关闭语法高亮与行号以保证界面流畅）。',
    'res.mediaTooLargeHint': '媒体响应超过 20MB 限制，不直接展示。',
    'res.mediaDownload': '直接下载',
    'res.mediaDownloaded': '下载完成！',
    'res.mediaDownloadFailed': '下载失败',
    'res.mediaNotPersisted': '媒体内容不随会话与历史保留，请重新发送请求查看。',
    'res.streaming': '流式接收中...',
    'res.thinking': '思考中',
    'res.cancelled': '已取消',
    'res.cancelledHint': '请求已取消。',
    'res.proxy': 'proxyed',
    'res.direct': 'noproxy',

    // 弹窗 - 集合
    'modal.createCollection': '新建集合',
    'modal.editCollection': '编辑集合',
    'modal.collectionName': '集合名称',
    'modal.collectionTags': '标签（逗号分隔）',
    'modal.cancel': '取消',
    'modal.create': '创建',
    'modal.save': '保存',
    'modal.move': '移动',

    // 弹窗 - 重命名
    'modal.renameRequest': '重命名请求',
    'modal.requestName': '请求名称',

    // 弹窗 - 保存请求
    'modal.saveRequest': '保存请求',

    // 弹窗 - 标签
    'modal.manageTags': '管理标签',
    'modal.newTagName': '新标签名称',
    'modal.add': '添加',

    // 弹窗 - 移动
    'modal.moveToCollection': '移动到集合',
    'modal.saveToCollection': '保存到集合',

    // 弹窗 - 导入
    'modal.importCurl': '导入 cURL',
    'modal.curlPlaceholder': '在此粘贴 curl 命令...',
    'modal.parseImport': '解析并导入',
    'modal.importPostman': '从 Postman 导入',
    'modal.postmanHint': '将从该文件导入 {n} 个请求。',
    'modal.postmanMultiHint': '将创建 {n} 个合集，共导入 {m} 个请求。',
    'modal.import': '导入',

    // 弹窗 - 设置
    'modal.settings': '设置',
    'settings.proxy': '代理',
    'settings.enableProxy': '启用代理',
    'settings.proxyNamePlaceholder': '名称',
    'settings.proxyUrlPlaceholder': 'proxy.example.com:8080',
    'settings.addProxy': '添加',
    'settings.deleteProxy': '删除',
    'settings.proxyFormat': '格式: host:port、http(s)://host:port 或 socks5://host:port（支持 socks4/4a/5/5h）',
    'settings.noProxy': 'NO_PROXY',
    'settings.noProxyHint': '逗号分隔的主机模式，支持 * 通配符（如 *.local）',
    'settings.ssl': 'SSL',
    'settings.ignoreSsl': '忽略 SSL 证书验证',
    'settings.sslHint': '启用后将跳过 HTTPS 证书验证（适用于自签名证书的开发环境）',
    'settings.requestDefaults': '请求默认值',
    'settings.defaultTimeout': '默认超时时间 (ms)',
    'settings.language': '语言',
    'settings.about': '关于',
    'settings.version': '版本',

    // 右键菜单
    'ctx.duplicate': '复制',
    'ctx.rename': '重命名',
    'ctx.addTag': '添加标签',
    'ctx.moveTo': '移动到...',
    'ctx.delete': '删除',
    'ctx.saveToCollection': '保存到集合',
    'ctx.deleteSelected': '删除选中',
    'ctx.deleteGroup': '删除该天全部记录',
    'ctx.importPostman': '从 Postman 备份导入...',
    'ctx.exportPostman': '导出为 Postman 格式...',
    'ctx.exportAllPostman': '导出全部接口...',

    // JS 中的文本
    'msg.pleaseEnterUrl': '请输入 URL',
    'msg.createCollectionFirst': '请先创建一个集合！',
    'msg.saved': '已保存！',
    'msg.updated': '已更新！',
    'msg.savedToCollection': '已保存到集合！',
    'msg.beautifyJsonOnly': '格式化仅支持 JSON 类型的请求体',
    'msg.invalidJson': '无效的 JSON',
    'msg.parseCurlFailed': '解析 cURL 命令失败：',
    'msg.pleasePasteCurl': '请粘贴 cURL 命令',
    'msg.deleteCollectionConfirm': '确定删除此集合？',
    'msg.postmanReadFailed': '文件读取失败',
    'msg.postmanInvalid': '不是有效的 Postman collection 文件',
    'msg.postmanEmpty': '文件中没有可导入的请求',
    'msg.imported': '已导入！',
    'msg.exported': '已导出！',
    'msg.exportFailed': '导出失败',

    // 日期
    'date.today': '今天',
    'date.yesterday': '昨天',

    // 错误卡片
    'err.sslExpired': 'SSL 证书已过期',
    'err.sslExpiredDetail': '目标服务器的 SSL 证书已超过有效期，连接被拒绝。',
    'err.sslExpiredHint1': '在设置中启用"忽略 SSL 证书验证"后重试。',
    'err.sslExpiredHint2': '如果是生产环境，请确认服务器证书是否需要更新。',
    'err.sslExpiredHint3': '已开启"忽略 SSL 证书验证"，但证书过期错误仍被抛出，请尝试重启应用后重试。',
    'err.sslExpiredHint4': '如果是内网测试环境，请联系管理员更新证书。',
    'err.selfSigned': '自签名证书不受信任',
    'err.selfSignedDetail': '目标服务器使用了自签名 SSL 证书，无法通过证书链验证。',
    'err.selfSignedHint1': '在设置中启用"忽略 SSL 证书验证"后重试。',
    'err.selfSignedHint2': '已开启"忽略 SSL 证书验证"，但此错误仍被抛出，请尝试重启应用。',
    'err.incompleteChain': '证书链不完整',
    'err.incompleteChainDetail': '服务器返回的证书链缺少中间证书，无法完成验证。',
    'err.incompleteChainHint1': '在设置中启用"忽略 SSL 证书验证"后重试。',
    'err.incompleteChainHint2': '建议服务器配置补全中间证书链。',
    'err.sslTlsFailed': 'SSL/TLS 握手失败',
    'err.sslTlsHint1': '在设置中启用"忽略 SSL 证书验证"后重试。',
    'err.sslTlsHint2': '已开启"忽略 SSL 证书验证"，但仍出现错误，请尝试重启应用。',
    'err.connRefused': '连接被拒绝',
    'err.connRefusedDetail': '目标服务器拒绝了连接请求，可能服务未启动或端口不正确。',
    'err.connRefusedHint1': '检查目标地址和端口是否正确。',
    'err.connRefusedHint2': '确认目标服务是否正在运行。',
    'err.dnsFailed': '域名解析失败',
    'err.dnsFailedDetail': '无法解析目标域名，请检查 URL 是否正确。',
    'err.dnsFailedHint1': '检查 URL 拼写是否正确。',
    'err.dnsFailedHint2': '检查网络连接和 DNS 配置。',
    'err.dnsFailedHint3': '如使用代理，确认代理设置是否正确。',
    'err.connReset': '连接被重置',
    'err.connResetDetail': '与服务器的连接被异常关闭。',
    'err.connResetHint1': '服务器可能强制关闭了连接。',
    'err.connResetHint2': '检查请求头（如 Host）是否正确。',
    'err.connResetHint3': '如使用代理，确认代理设置是否正确。',
    'err.timeout': '请求超时',
    'err.timeoutDetail': '在规定时间内未收到服务器响应。',
    'err.timeoutHint1': '检查网络连接是否正常。',
    'err.timeoutHint2': '在设置中增大超时时间后重试。',
    'err.timeoutHint3': '如使用代理，确认代理是否可达。',
    'err.wrongVersion': '协议版本错误',
    'err.wrongVersionDetail': '可能与代理服务器的协议不匹配（如通过 HTTP 代理访问 HTTPS 站点时出现）。',
    'err.wrongVersionHint1': '检查代理地址的协议是否正确（通常为 http:// 而非 https://）。',
    'err.wrongVersionHint2': '确认代理服务器是否支持 CONNECT 隧道。',
    'err.proxyFailed': '代理连接失败',
    'err.proxyFailedHint1': '检查代理地址是否正确。',
    'err.proxyFailedHint2': '确认代理服务是否正在运行。',
    'err.proxyFailedHint3': '如不需要代理，在设置中关闭代理。',
    'err.requestFailed': '请求失败',
    'err.saveDataFailed': '数据保存失败，更改将无法保留（存储位置不可写）',
    'err.loadDataFailed': '数据文件读取失败，已使用空数据启动',
  },

  ja: {
    // サイドバー
    'sidebar.history': '履歴',
    'sidebar.collections': 'コレクション',
    'sidebar.search': 'APIを検索...',
    'sidebar.newCollection': '+ コレクションを作成',
    'sidebar.newRequest': '新規リクエスト',
    'sidebar.import': 'インポート',
    'sidebar.settings': '設定',
    'sidebar.toggleTheme': 'テーマ切替',

    // URL バー
    'url.placeholder': 'リクエストURLを入力',
    'url.send': '送信',
    'url.cancel': 'キャンセル',
    'url.curl': 'cURL',
    'url.save': '保存',
    'url.noProxy': 'プロキシなし',
    'url.proxySettings': 'プロキシ設定...',

    // リクエストパネル
    'req.params': 'パラメータ',
    'req.headers': 'ヘッダー',
    'req.body': 'ボディ',
    'req.key': 'キー',
    'req.value': '値',
    'req.description': '説明',
    'req.addParam': '+ パラメータを追加',
    'req.addHeader': '+ ヘッダーを追加',
    'req.bodyType.none': 'なし',
    'req.bodyType.json': 'JSON',
    'req.bodyType.text': 'テキスト',
    'req.bodyType.form': 'x-www-form-urlencoded',
    'req.bodyType.multipart': 'multipart/form-data',
    'req.beautify': '整形',
    'req.bodyPlaceholder': 'リクエストボディ...',

    // レスポンスパネル
    'res.pretty': '整形表示',
    'res.raw': 'Raw',
    'res.preview': 'プレビュー',
    'res.headers': 'ヘッダー',
    'res.copy': 'コピー',
    'find.placeholder': '検索',
    'find.prev': '前へ',
    'find.next': '次へ',
    'find.close': '閉じる',
    'tabs.newRequest': '新規リクエスト',
    'tabs.close': 'タブを閉じる',
    'tabs.unsavedTitle': '未保存の変更',
    'tabs.unsavedMessage': 'このリクエストには未保存の変更があります。閉じる前に保存しますか？',
    'tabs.discard': '保存しない',
    'tabs.copyBadge': 'コピー',
    'raw.title': 'HTTP 生リクエスト',
    'raw.tooltip': '実際に送信される HTTP 生リクエストを表示',
    'msg.invalidUrl': '無効な URL です',
    'multipart.addField': '+ フィールド追加',
    'multipart.selectFile': 'ファイル選択',
    'multipart.noFile': 'ファイル未選択',
    'multipart.fileReadError': 'ファイル読み込み失敗',
    'res.copyResponse': 'レスポンスをコピー',
    'res.clickSend': '送信ボタンを押してレスポンスを取得',
    'res.emptyTitle': 'レスポンスはまだありません',
    'res.sending': '送信中...',
    'res.sendingRequest': 'リクエスト送信中...',
    'res.error': 'エラー',
    'res.noHeaders': 'ヘッダーなし',
    'res.mediaPreviewHint': 'メディアタイプのレスポンス：Preview で表示・再生し、Headers でレスポンスヘッダーを確認してください。',
    'res.plainRenderHint': 'レスポンスが大きいためプレーンテキストで表示しています（シンタックスハイライト・行番号なし、UI 応答性を優先）。',
    'res.mediaTooLargeHint': 'メディアレスポンスが 20MB の制限を超えているため表示しません。',
    'res.mediaDownload': '直接ダウンロード',
    'res.mediaDownloaded': 'ダウンロード完了！',
    'res.mediaDownloadFailed': 'ダウンロードに失敗しました',
    'res.mediaNotPersisted': 'メディア内容はセッションや履歴に保存されません。再送信して表示してください。',
    'res.streaming': 'ストリーミング受信中...',
    'res.thinking': '思考中',
    'res.cancelled': 'キャンセル済み',
    'res.cancelledHint': 'リクエストはキャンセルされました。',
    'res.proxy': 'proxyed',
    'res.direct': 'noproxy',

    // ダイアログ - コレクション
    'modal.createCollection': 'コレクションを作成',
    'modal.editCollection': 'コレクションを編集',
    'modal.collectionName': 'コレクション名',
    'modal.collectionTags': 'タグ（カンマ区切り）',
    'modal.cancel': 'キャンセル',
    'modal.create': '作成',
    'modal.save': '保存',
    'modal.move': '移動',

    // ダイアログ - リネーム
    'modal.renameRequest': 'リクエスト名を変更',
    'modal.requestName': 'リクエスト名',

    // ダイアログ - リクエスト保存
    'modal.saveRequest': 'リクエストを保存',

    // ダイアログ - タグ
    'modal.manageTags': 'タグを管理',
    'modal.newTagName': '新しいタグ名',
    'modal.add': '追加',

    // ダイアログ - 移動
    'modal.moveToCollection': 'コレクションへ移動',
    'modal.saveToCollection': 'コレクションに保存',

    // ダイアログ - インポート
    'modal.importCurl': 'cURL をインポート',
    'modal.curlPlaceholder': 'ここに curl コマンドを貼り付け...',
    'modal.parseImport': '解析してインポート',
    'modal.importPostman': 'Postman からインポート',
    'modal.postmanHint': 'このファイルから {n} 件のリクエストをインポートします。',
    'modal.postmanMultiHint': '{n} 個のコレクションを作成し、合計 {m} 件のリクエストをインポートします。',
    'modal.import': 'インポート',

    // ダイアログ - 設定
    'modal.settings': '設定',
    'settings.proxy': 'プロキシ',
    'settings.enableProxy': 'プロキシを有効化',
    'settings.proxyNamePlaceholder': '名前',
    'settings.proxyUrlPlaceholder': 'proxy.example.com:8080',
    'settings.addProxy': '追加',
    'settings.deleteProxy': '削除',
    'settings.proxyFormat': '形式: host:port、http(s)://host:port または socks5://host:port（socks4/4a/5/5h 対応）',
    'settings.noProxy': 'NO_PROXY',
    'settings.noProxyHint': 'カンマ区切りのホストパターン、* ワイルドカード対応（例: *.local）',
    'settings.ssl': 'SSL',
    'settings.ignoreSsl': 'SSL証明書の検証を無視',
    'settings.sslHint': '有効にするとHTTPS証明書の検証をスキップします（自己署名証明書の開発環境向け）',
    'settings.requestDefaults': 'リクエスト既定値',
    'settings.defaultTimeout': '既定タイムアウト (ms)',
    'settings.language': '言語',
    'settings.about': 'このアプリについて',
    'settings.version': 'バージョン',

    // 右クリックメニュー
    'ctx.duplicate': '複製',
    'ctx.rename': '名前を変更',
    'ctx.addTag': 'タグを追加',
    'ctx.moveTo': '移動...',
    'ctx.delete': '削除',
    'ctx.saveToCollection': 'コレクションに保存',
    'ctx.deleteSelected': '選択を削除',
    'ctx.deleteGroup': 'この日の全記録を削除',
    'ctx.importPostman': 'Postman バックアップからインポート...',
    'ctx.exportPostman': 'Postman 形式でエクスポート...',
    'ctx.exportAllPostman': 'すべてのリクエストをエクスポート...',

    // JS 内テキスト
    'msg.pleaseEnterUrl': 'URLを入力してください',
    'msg.createCollectionFirst': '先にコレクションを作成してください！',
    'msg.saved': '保存しました！',
    'msg.updated': '更新しました！',
    'msg.savedToCollection': 'コレクションに保存しました！',
    'msg.beautifyJsonOnly': '整形はJSONタイプのボディのみ対応しています',
    'msg.invalidJson': '無効なJSONです',
    'msg.parseCurlFailed': 'curlコマンドの解析に失敗しました：',
    'msg.pleasePasteCurl': 'curlコマンドを貼り付けてください',
    'msg.deleteCollectionConfirm': 'このコレクションを削除しますか？',
    'msg.postmanReadFailed': 'ファイルの読み込みに失敗しました',
    'msg.postmanInvalid': '有効なPostmanコレクションファイルではありません',
    'msg.postmanEmpty': 'ファイルにインポート可能なリクエストがありません',
    'msg.imported': 'インポートしました！',
    'msg.exported': 'エクスポートしました！',
    'msg.exportFailed': 'エクスポートに失敗しました',

    // 日付
    'date.today': '今日',
    'date.yesterday': '昨日',

    // エラーカード
    'err.sslExpired': 'SSL証明書の有効期限切れ',
    'err.sslExpiredDetail': '対象サーバーのSSL証明書の有効期限が切れており、接続が拒否されました。',
    'err.sslExpiredHint1': '設定で「SSL証明書の検証を無視」を有効にして再試行してください。',
    'err.sslExpiredHint2': '本番環境の場合、サーバー証明書の更新が必要か確認してください。',
    'err.sslExpiredHint3': '「SSL証明書の検証を無視」を有効にしてもエラーが解消しない場合、アプリを再起動してください。',
    'err.sslExpiredHint4': '社内テスト環境の場合、管理者に証明書の更新を依頼してください。',
    'err.selfSigned': '自己署名証明書が信頼されていません',
    'err.selfSignedDetail': '対象サーバーは自己署名SSL証明書を使用しており、証明書チェーンの検証を通過できません。',
    'err.selfSignedHint1': '設定で「SSL証明書の検証を無視」を有効にして再試行してください。',
    'err.selfSignedHint2': '「SSL証明書の検証を無視」を有効にしてもこのエラーが出る場合、アプリを再起動してください。',
    'err.incompleteChain': '証明書チェーンが不完全',
    'err.incompleteChainDetail': 'サーバーが返した証明書チェーンに中間証明書がなく、検証を完了できません。',
    'err.incompleteChainHint1': '設定で「SSL証明書の検証を無視」を有効にして再試行してください。',
    'err.incompleteChainHint2': 'サーバー側で中間証明書チェーンを補完することを推奨します。',
    'err.sslTlsFailed': 'SSL/TLSハンドシェイク失敗',
    'err.sslTlsHint1': '設定で「SSL証明書の検証を無視」を有効にして再試行してください。',
    'err.sslTlsHint2': '「SSL証明書の検証を無視」を有効にしてもエラーが続く場合、アプリを再起動してください。',
    'err.connRefused': '接続が拒否されました',
    'err.connRefusedDetail': '対象サーバーが接続を拒否しました。サービスが起動していないか、ポートが正しくない可能性があります。',
    'err.connRefusedHint1': '対象アドレスとポートが正しいか確認してください。',
    'err.connRefusedHint2': '対象サービスが起動しているか確認してください。',
    'err.dnsFailed': 'DNS名前解決に失敗',
    'err.dnsFailedDetail': '対象ドメインを解決できません。URLを確認してください。',
    'err.dnsFailedHint1': 'URLのスペルを確認してください。',
    'err.dnsFailedHint2': 'ネットワーク接続とDNS設定を確認してください。',
    'err.dnsFailedHint3': 'プロキシ使用時は、プロキシ設定が正しいか確認してください。',
    'err.connReset': '接続がリセットされました',
    'err.connResetDetail': 'サーバーとの接続が異常に切断されました。',
    'err.connResetHint1': 'サーバーが接続を強制切断した可能性があります。',
    'err.connResetHint2': 'リクエストヘッダー（Hostなど）が正しいか確認してください。',
    'err.connResetHint3': 'プロキシ使用時は、プロキシ設定が正しいか確認してください。',
    'err.timeout': 'リクエストタイムアウト',
    'err.timeoutDetail': '指定時間内にサーバーから応答がありませんでした。',
    'err.timeoutHint1': 'ネットワーク接続を確認してください。',
    'err.timeoutHint2': '設定でタイムアウト時間を延長して再試行してください。',
    'err.timeoutHint3': 'プロキシ使用時は、プロキシが到達可能か確認してください。',
    'err.wrongVersion': 'プロトコルバージョンエラー',
    'err.wrongVersionDetail': 'プロキシサーバーとのプロトコル不一致の可能性があります（例：HTTPプロキシ経由でHTTPSサイトにアクセス）。',
    'err.wrongVersionHint1': 'プロキシアドレスのプロトコルが正しいか確認してください（通常は http:// で https:// ではありません）。',
    'err.wrongVersionHint2': 'プロキシサーバーがCONNECTトンネリングに対応しているか確認してください。',
    'err.proxyFailed': 'プロキシ接続失敗',
    'err.proxyFailedHint1': 'プロキシアドレスが正しいか確認してください。',
    'err.proxyFailedHint2': 'プロキシサービスが起動しているか確認してください。',
    'err.proxyFailedHint3': 'プロキシ不要の場合は設定で無効にしてください。',
    'err.requestFailed': 'リクエスト失敗',
    'err.saveDataFailed': 'データの保存に失敗しました。変更は保持されません（保存先に書き込みできません）',
    'err.loadDataFailed': 'データファイルの読み込みに失敗しました。空のデータで起動します',
  },

  'zh-TW': {
    // 側邊欄
    'sidebar.history': '歷史記錄',
    'sidebar.collections': '集合',
    'sidebar.search': '搜尋 API...',
    'sidebar.newCollection': '+ 新增集合',
    'sidebar.newRequest': '新增請求',
    'sidebar.import': '匯入',
    'sidebar.settings': '設定',
    'sidebar.toggleTheme': '切換主題',

    // URL 列
    'url.placeholder': '輸入請求 URL',
    'url.send': '傳送',
    'url.cancel': '取消',
    'url.curl': 'cURL',
    'url.save': '儲存',
    'url.noProxy': '不使用代理',
    'url.proxySettings': '代理伺服器設定...',

    // 請求面板
    'req.params': '參數',
    'req.headers': '請求標頭',
    'req.body': '請求主體',
    'req.key': '鍵',
    'req.value': '值',
    'req.description': '說明',
    'req.addParam': '+ 新增參數',
    'req.addHeader': '+ 新增請求標頭',
    'req.bodyType.none': '無',
    'req.bodyType.json': 'JSON',
    'req.bodyType.text': '文字',
    'req.bodyType.form': 'x-www-form-urlencoded',
    'req.bodyType.multipart': 'multipart/form-data',
    'req.beautify': '格式化',
    'req.bodyPlaceholder': '請求主體內容...',

    // 回應面板
    'res.pretty': '格式化',
    'res.raw': '原始',
    'res.preview': '預覽',
    'res.headers': '回應標頭',
    'res.copy': '複製',
    'find.placeholder': '尋找',
    'find.prev': '上一個',
    'find.next': '下一個',
    'find.close': '關閉',
    'tabs.newRequest': '新請求',
    'tabs.close': '關閉標籤',
    'tabs.unsavedTitle': '未儲存的修改',
    'tabs.unsavedMessage': '該請求有未儲存的修改，關閉前是否儲存？',
    'tabs.discard': '不儲存',
    'tabs.copyBadge': '副本',
    'raw.title': 'HTTP 原始請求報文',
    'raw.tooltip': '查看實際傳送的 HTTP 原始請求報文',
    'msg.invalidUrl': '無效的 URL',
    'multipart.addField': '+ 新增欄位',
    'multipart.selectFile': '選擇檔案',
    'multipart.noFile': '未選擇檔案',
    'multipart.fileReadError': '檔案讀取失敗',
    'res.copyResponse': '複製回應',
    'res.clickSend': '點擊傳送按鈕取得回應',
    'res.emptyTitle': '尚無回應',
    'res.sending': '傳送中...',
    'res.sendingRequest': '正在傳送請求...',
    'res.error': '錯誤',
    'res.noHeaders': '無標頭',
    'res.mediaPreviewHint': '媒體類型回應：請在 Preview 檢視 / 播放，Headers 檢視回應標頭。',
    'res.plainRenderHint': '回應本體較大，已按純文字渲染（關閉語法高亮與行號以保證介面流暢）。',
    'res.mediaTooLargeHint': '媒體回應超過 20MB 限制，不直接顯示。',
    'res.mediaDownload': '直接下載',
    'res.mediaDownloaded': '下載完成！',
    'res.mediaDownloadFailed': '下載失敗',
    'res.mediaNotPersisted': '媒體內容不隨工作階段與歷史保留，請重新傳送請求查看。',
    'res.streaming': '串流接收中...',
    'res.thinking': '思考中',
    'res.cancelled': '已取消',
    'res.cancelledHint': '請求已取消。',
    'res.proxy': 'proxyed',
    'res.direct': 'noproxy',

    // 彈窗 - 集合
    'modal.createCollection': '新增集合',
    'modal.editCollection': '編輯集合',
    'modal.collectionName': '集合名稱',
    'modal.collectionTags': '標籤（逗號分隔）',
    'modal.cancel': '取消',
    'modal.create': '建立',
    'modal.save': '儲存',
    'modal.move': '移動',

    // 彈窗 - 重新命名
    'modal.renameRequest': '重新命名請求',
    'modal.requestName': '請求名稱',

    // 彈窗 - 儲存請求
    'modal.saveRequest': '儲存請求',

    // 彈窗 - 標籤
    'modal.manageTags': '管理標籤',
    'modal.newTagName': '新標籤名稱',
    'modal.add': '新增',

    // 彈窗 - 移動
    'modal.moveToCollection': '移動至集合',
    'modal.saveToCollection': '儲存至集合',

    // 彈窗 - 匯入
    'modal.importCurl': '匯入 cURL',
    'modal.curlPlaceholder': '在此貼上 curl 命令...',
    'modal.parseImport': '解析並匯入',
    'modal.importPostman': '從 Postman 匯入',
    'modal.postmanHint': '將從此檔案匯入 {n} 個請求。',
    'modal.postmanMultiHint': '將建立 {n} 個合輯，共匯入 {m} 個請求。',
    'modal.import': '匯入',

    // 彈窗 - 設定
    'modal.settings': '設定',
    'settings.proxy': '代理伺服器',
    'settings.enableProxy': '啟用代理伺服器',
    'settings.proxyNamePlaceholder': '名稱',
    'settings.proxyUrlPlaceholder': 'proxy.example.com:8080',
    'settings.addProxy': '新增',
    'settings.deleteProxy': '刪除',
    'settings.proxyFormat': '格式: host:port、http(s)://host:port 或 socks5://host:port（支援 socks4/4a/5/5h）',
    'settings.noProxy': 'NO_PROXY',
    'settings.noProxyHint': '以逗號分隔的主機模式，支援 * 萬用字元（如 *.local）',
    'settings.ssl': 'SSL',
    'settings.ignoreSsl': '忽略 SSL 憑證驗證',
    'settings.sslHint': '啟用後將跳過 HTTPS 憑證驗證（適用於自簽憑證的開發環境）',
    'settings.requestDefaults': '請求預設值',
    'settings.defaultTimeout': '預設逾時時間 (ms)',
    'settings.language': '語言',
    'settings.about': '關於',
    'settings.version': '版本',

    // 右鍵選單
    'ctx.duplicate': '複製',
    'ctx.rename': '重新命名',
    'ctx.addTag': '新增標籤',
    'ctx.moveTo': '移動至...',
    'ctx.delete': '刪除',
    'ctx.saveToCollection': '儲存至集合',
    'ctx.deleteSelected': '刪除所選',
    'ctx.deleteGroup': '刪除該天全部記錄',
    'ctx.importPostman': '從 Postman 備份匯入...',
    'ctx.exportPostman': '匯出為 Postman 格式...',
    'ctx.exportAllPostman': '匯出全部介面...',

    // JS 中的文字
    'msg.pleaseEnterUrl': '請輸入 URL',
    'msg.createCollectionFirst': '請先建立一個集合！',
    'msg.saved': '已儲存！',
    'msg.updated': '已更新！',
    'msg.savedToCollection': '已儲存至集合！',
    'msg.beautifyJsonOnly': '格式化僅支援 JSON 類型的請求主體',
    'msg.invalidJson': '無效的 JSON',
    'msg.parseCurlFailed': '解析 cURL 命令失敗：',
    'msg.pleasePasteCurl': '請貼上 cURL 命令',
    'msg.deleteCollectionConfirm': '確定刪除此集合？',
    'msg.postmanReadFailed': '檔案讀取失敗',
    'msg.postmanInvalid': '不是有效的 Postman collection 檔案',
    'msg.postmanEmpty': '檔案中沒有可匯入的請求',
    'msg.imported': '已匯入！',
    'msg.exported': '已匯出！',
    'msg.exportFailed': '匯出失敗',

    // 日期
    'date.today': '今天',
    'date.yesterday': '昨天',

    // 錯誤卡片
    'err.sslExpired': 'SSL 憑證已過期',
    'err.sslExpiredDetail': '目標伺服器的 SSL 憑證已超過有效期，連線被拒絕。',
    'err.sslExpiredHint1': '在設定中啟用「忽略 SSL 憑證驗證」後重試。',
    'err.sslExpiredHint2': '如果是正式環境，請確認伺服器憑證是否需要更新。',
    'err.sslExpiredHint3': '已開啟「忽略 SSL 憑證驗證」，但憑證過期錯誤仍出現，請嘗試重新啟動應用程式後重試。',
    'err.sslExpiredHint4': '如果是內部測試環境，請聯絡管理員更新憑證。',
    'err.selfSigned': '自簽憑證不受信任',
    'err.selfSignedDetail': '目標伺服器使用了自簽 SSL 憑證，無法通過憑證鏈驗證。',
    'err.selfSignedHint1': '在設定中啟用「忽略 SSL 憑證驗證」後重試。',
    'err.selfSignedHint2': '已開啟「忽略 SSL 憑證驗證」，但此錯誤仍出現，請嘗試重新啟動應用程式。',
    'err.incompleteChain': '憑證鏈不完整',
    'err.incompleteChainDetail': '伺服器回傳的憑證鏈缺少中繼憑證，無法完成驗證。',
    'err.incompleteChainHint1': '在設定中啟用「忽略 SSL 憑證驗證」後重試。',
    'err.incompleteChainHint2': '建議伺服器設定補全中繼憑證鏈。',
    'err.sslTlsFailed': 'SSL/TLS 交握失敗',
    'err.sslTlsHint1': '在設定中啟用「忽略 SSL 憑證驗證」後重試。',
    'err.sslTlsHint2': '已開啟「忽略 SSL 憑證驗證」，但仍出現錯誤，請嘗試重新啟動應用程式。',
    'err.connRefused': '連線被拒絕',
    'err.connRefusedDetail': '目標伺服器拒絕了連線請求，可能服務未啟動或連接埠不正確。',
    'err.connRefusedHint1': '檢查目標位址和連接埠是否正確。',
    'err.connRefusedHint2': '確認目標服務是否正在執行。',
    'err.dnsFailed': '網域名稱解析失敗',
    'err.dnsFailedDetail': '無法解析目標網域，請檢查 URL 是否正確。',
    'err.dnsFailedHint1': '檢查 URL 拼寫是否正確。',
    'err.dnsFailedHint2': '檢查網路連線和 DNS 設定。',
    'err.dnsFailedHint3': '如使用代理，確認代理設定是否正確。',
    'err.connReset': '連線被重設',
    'err.connResetDetail': '與伺服器的連線被異常關閉。',
    'err.connResetHint1': '伺服器可能強制關閉了連線。',
    'err.connResetHint2': '檢查請求標頭（如 Host）是否正確。',
    'err.connResetHint3': '如使用代理，確認代理設定是否正確。',
    'err.timeout': '請求逾時',
    'err.timeoutDetail': '在規定時間內未收到伺服器回應。',
    'err.timeoutHint1': '檢查網路連線是否正常。',
    'err.timeoutHint2': '在設定中增大逾時時間後重試。',
    'err.timeoutHint3': '如使用代理，確認代理是否可連線。',
    'err.wrongVersion': '通訊協定版本錯誤',
    'err.wrongVersionDetail': '可能與代理伺服器的通訊協定不相符（如透過 HTTP 代理存取 HTTPS 網站時出現）。',
    'err.wrongVersionHint1': '檢查代理位址的通訊協定是否正確（通常為 http:// 而非 https://）。',
    'err.wrongVersionHint2': '確認代理伺服器是否支援 CONNECT 通道。',
    'err.proxyFailed': '代理連線失敗',
    'err.proxyFailedHint1': '檢查代理位址是否正確。',
    'err.proxyFailedHint2': '確認代理服務是否正在執行。',
    'err.proxyFailedHint3': '如不需要代理，在設定中關閉代理。',
    'err.requestFailed': '請求失敗',
    'err.saveDataFailed': '資料儲存失敗，變更將無法保留（儲存位置不可寫入）',
    'err.loadDataFailed': '資料檔案讀取失敗，已使用空白資料啟動',
  }
};

let currentLang = 'en';

/**
 * 获取翻译文本
 */
export function t(key) {
  return dictionaries[currentLang]?.[key] || dictionaries.en[key] || key;
}

/**
 * 获取当前语言
 */
export function getLang() {
  return currentLang;
}

/**
 * 设置语言并持久化
 */
export function setLang(lang) {
  currentLang = lang;
  if (!appData.settings) appData.settings = {};
  appData.settings.language = lang;
  saveData(appData);
  applyI18n();
  // 语言变更后重新渲染侧边栏，使日期分组标签更新
  if (window.__renderSidebar) window.__renderSidebar();
  // 语言变更后同步刷新地址栏代理图标的悬停提示
  if (window.__refreshProxyIndicator) window.__refreshProxyIndicator();
}

/**
 * 初始化语言（从持久化设置中读取）
 */
export function initLang() {
  const saved = appData.settings?.language;
  currentLang = saved && dictionaries[saved] ? saved : 'en';
  applyI18n();
}

/**
 * 遍历 DOM 中所有 data-i18n 属性，替换文本内容
 * data-i18n="key"        → 替换 textContent
 * data-i18n-placeholder="key" → 替换 placeholder
 * data-i18n-title="key"  → 替换 title
 */
export function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  // 更新 HTML lang 属性
  const htmlLangs = { zh: 'zh-CN', 'zh-TW': 'zh-TW', ja: 'ja' };
  document.documentElement.lang = htmlLangs[currentLang] || 'en';
}
