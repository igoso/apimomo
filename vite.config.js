import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  define: {
    // __DATA_FILE_PATH__ 仅为回退值：正常运行时数据文件路径由主进程注入（用户数据目录）
    '__DATA_FILE_PATH__': JSON.stringify(path.join(__dirname, 'data.json')),
    '__APP_VERSION__': JSON.stringify(pkg.version),
  },
  plugins: [
    electron({
      entry: '../electron/main.js',
      // 主进程代码变更后自动重启 Electron，避免 dev 模式下跑着旧主进程
      onstart: (args) => args.startup(),
    }),
    renderer(),
  ],
});
