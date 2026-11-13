# Changelog

## [1.0.7] - 2026-11-13

### Added

- **SOCKS proxies** — proxy entries now support socks4 / socks4a / socks5 / socks5h schemes (applies uniformly to requests, media downloads and SSE streams)

### Improved

- **URL ↔ Params two-way sync** — the URL query and the Params table now mirror each other: query params in the URL are parsed into the table without being stripped from the URL, and editing the table writes back to the URL in real time (unchecked rows stay in the table only); cURL import keeps the query as well, and sync no longer applies to GET only
- The Params / Headers "+ Add" buttons moved to the first row right under the tabs — no more scrolling to the bottom of long tables
- The tab bar "+" button is pinned to the right of the scrolling area, never hidden no matter how many tabs are open

### Fixed

- Clicking a history entry froze the UI for seconds: huge response bodies rendered hundreds of thousands of highlight/line-number nodes; bodies over 200KB now render as chunked plain text with content-visibility
- Code leaked past the line-number column when scrolling Pretty views horizontally (two unpainted gaps: the gutter spacing and the scroll container's left padding)

## [1.0.6] - 2026-11-06

### Improved

- **Request timeout enforced** — the timeout setting now actually applies to requests and downloads (stalled connections/responses fail after the configured time instead of hanging forever; downloads with steady data are unaffected)

### Fixed

- Media preview failed when the response content-type was not a media type (e.g. octet-stream / text) even though the body was a valid image/audio/video (the actual type is now detected from magic bytes)
- Misleading errors when the response stream was interrupted by a proxy: misreported as "media too large", or the UI stuck on sending
- The address-bar proxy button sometimes did not open its menu (the global press-feedback style overrode the button's vertical centering, dropping it mid-press so the click landed on the URL input); context menus no longer linger and block clicks; a fast double-click no longer opens-then-closes the menu instantly

## [1.0.5] - 2026-11-06

### Added

- **Media responses** — images/audio/video open in Preview automatically; responses over 20MB (checked from headers) show an over-limit hint with a confirm-to-download option; right-click media to save as

### Improved

- **GET params auto-parse** — query params typed in the URL bar are split into the Params table (on blur / Enter to send / paste)
- Collection modal autofocuses the name input and confirms on Enter anywhere in the modal; IME composition Enter no longer triggers by accident (also applied to save-request, rename and URL send)
- Postman import restores multiple collections as groups (matching the "export all" file structure)
- Electron restarts automatically after main-process code changes in dev mode

### Fixed

- Oversized response bodies kept growing the data file and freezing the UI on save (bodies over 1MB are no longer persisted in history or session)
- Clicking (without moving) on the window drag area moved or froze the frameless window (drag now requires a small move threshold)
- Collection names displayed in forced uppercase

## [1.0.4] - 2026-10-30

### Added

- **Postman export** — right-click a collection to export it, or right-click the blank area to export all collections; collection v2.1 format, exported files can be re-imported, filename includes a timestamp (yyyyMMddHHmmss), ApiMomo version recorded in the data

### Changed

- **License** — switched from MIT to PolyForm Noncommercial 1.0.0: free for noncommercial use, modification, and distribution; commercial use requires a separate license from the author (igoso@qq.com)

### Fixed

- Sidebar collapse state lost after clicking a request (collections and history date groups)
- Window top area not draggable on some systems

## [1.0.3] - 2026-10-29

### Added

- **Duplicate request** — open a copy as a new tab from collections/history via right-click, saved as a new request without overwriting the original
- **Tab context menu** — rename / duplicate; renaming a saved request also updates the collection
- **Tab auto-scroll** — opened/switched tabs scroll into view automatically
- **History shows request names** — requests saved in collections display their names in history, synced after rename

### Fixed

- Caret misalignment when deleting characters in the Body editor
- Tab bar scrollbar not draggable, scroll position lost after re-render
- Window top area not draggable

## [1.0.2] - 2026-10-28

### Added

- **Request tabs** — edit multiple requests in parallel, unsaved indicator, three-way prompt when closing unsaved tabs, drag to reorder
- **Ctrl+S save / Ctrl+F search**
- **Session restore** — tabs and unsaved content preserved on exit
- **Raw HTTP request preview**
- **More body types** — multipart/form-data (file support), x-www-form-urlencoded
- **Frameless window** and visual refresh (unified fonts, font sizes, color tokens, SVG icons)
- **Response empty & loading states**, persisted panel widths

### Changed

- Request/response tabs unified into a pill style, buttons layered by prominence

### Fixed

- Body editor caret misalignment, form tables and text editor shown at the same time when switching body types, urlencoded checkboxes not taking effect, and more

## [1.0.1] - 2026-09-23

### Added

- **Proxy** — list management, status icon in the URL bar with quick switching, NO_PROXY wildcards
- **Per-row checkboxes** — Params/Headers enable toggles, unchecked rows are not sent
- **Postman backup import** — collection v2.1 JSON
- **History batch delete** — Shift/Ctrl multi-select, delete by day group
- **Header dropdown suggestions**, **cancellable requests**
- **App icon** and standard NSIS installer; 日本語 / 繁體中文 support
- README rewrite; faster packaging (`dist:win:dir`)

### Changed

- **Data storage location** — moved to the system user data directory, old data migrated automatically on first run

### Fixed

- Copy as cURL broken in packaged builds, proxy protocol prefix misdetection, exe icon fallback at small sizes, silent data read/write failures, and more

## [1.0.0] - 2026-05-07

Initial release.

- HTTP request debugging (7 methods), Params / Headers / Body editing (JSON highlighting)
- Response viewer (Pretty / Raw / Preview / Headers), SSE streaming rendering
- History, collection management, cURL conversion
- Proxy & SSL, dark/light themes, Chinese/English UI
