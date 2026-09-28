import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(PACKAGE_ROOT, 'pages');
const ASSETS_DIR = path.join(PACKAGE_ROOT, 'assets');
const STATE_FILENAME = '.statuskit.json';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const copyDirRecursive = (src, dest) => {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((child) => {
      copyDirRecursive(path.join(src, child), path.join(dest, child));
    });
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
};

const readState = (baseDir = process.cwd()) => {
  const primaryPath = path.join(baseDir, STATE_FILENAME);
  const cwdPath = path.join(process.cwd(), STATE_FILENAME);
  const targetPath = fs.existsSync(primaryPath) ? primaryPath : (fs.existsSync(cwdPath) ? cwdPath : null);

  if (!targetPath) return null;

  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const renderTemplate = (pageName, state, options) => {
  const filePath = path.join(PAGES_DIR, pageName);
  if (!fs.existsSync(filePath)) return null;

  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replaceAll('../assets/images/', '/assets/images/');

  if (pageName === 'migration.html') {
    const targetDomain = state?.to ?? options.to ?? 'example.com';
    html = html.replaceAll('new.example.com', targetDomain);
    const sourceDomain = state?.from ?? options.from;
    if (sourceDomain) {
      html = html.replaceAll('old.example.com', sourceDomain);
    }
  }

  return html;
};

export const statuskit = (options = {}) => {
  let resolvedOutDir = 'dist';

  return {
    name: 'vite-plugin-statuskit',
    configResolved(config) {
      resolvedOutDir = config.build.outDir || 'dist';
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;
        const state = readState(process.cwd());

        if (pathname === '/maintenance.html' || pathname === '/migration.html') {
          const pageName = pathname.slice(1);
          const html = renderTemplate(pageName, state, options);
          if (html) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          }
        }

        if (pathname.startsWith('/assets/images/')) {
          const relativeAsset = pathname.replace('/assets/images/', '');
          const assetPath = path.join(ASSETS_DIR, 'images', relativeAsset);
          if (fs.existsSync(assetPath)) {
            const ext = path.extname(assetPath).toLowerCase();
            const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(assetPath).pipe(res);
            return;
          }
        }

        if (state && (state.status === 'maintenance' || state.status === 'migration')) {
          const acceptHeader = req.headers.accept ?? '';
          const hasExtension = Boolean(path.extname(pathname));
          const isHtmlRequest = req.method === 'GET' && (acceptHeader.includes('text/html') || !hasExtension);

          if (isHtmlRequest && !pathname.startsWith('/api')) {
            const pageName = state.status === 'maintenance' ? 'maintenance.html' : 'migration.html';
            const html = renderTemplate(pageName, state, options);
            if (html) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(html);
              return;
            }
          }
        }

        next();
      });
    },
    closeBundle() {
      const outPath = path.resolve(process.cwd(), resolvedOutDir);
      if (!fs.existsSync(outPath)) return;

      const state = readState(process.cwd());
      if (!state || state.status === 'live') {
        return;
      }

      const destImages = path.join(outPath, 'assets', 'images');
      copyDirRecursive(path.join(ASSETS_DIR, 'images'), destImages);

      const indexPath = path.join(outPath, 'index.html');
      const backupPath = path.join(outPath, 'index.app.html');

      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, backupPath);
      }

      if (state.status === 'maintenance') {
        const srcPath = path.join(PAGES_DIR, 'maintenance.html');
        let content = fs.readFileSync(srcPath, 'utf8');
        content = content.replaceAll('../assets/images/', '/assets/images/');
        fs.writeFileSync(indexPath, content, 'utf8');
      } else if (state.status === 'migration') {
        const srcPath = path.join(PAGES_DIR, 'migration.html');
        let content = fs.readFileSync(srcPath, 'utf8');
        content = content.replaceAll('../assets/images/', '/assets/images/');
        const targetDomain = state.to ?? options.to ?? 'example.com';
        content = content.replaceAll('new.example.com', targetDomain);
        const sourceDomain = state.from ?? options.from;
        if (sourceDomain) {
          content = content.replaceAll('old.example.com', sourceDomain);
        }
        fs.writeFileSync(indexPath, content, 'utf8');
      }
    }
  };
};

export default statuskit;
