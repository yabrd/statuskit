import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(PACKAGE_ROOT, 'pages');
const ASSETS_DIR = path.join(PACKAGE_ROOT, 'assets');

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

        if (pathname === '/maintenance.html' || pathname === '/migration.html') {
          const pageName = pathname.slice(1);
          const filePath = path.join(PAGES_DIR, pageName);
          if (fs.existsSync(filePath)) {
            let html = fs.readFileSync(filePath, 'utf8');
            html = html.replaceAll('../assets/images/', '/assets/images/');
            if (pageName === 'migration.html') {
              if (options.from) html = html.replaceAll('old.example.com', options.from);
              if (options.to) html = html.replaceAll('new.example.com', options.to);
            }
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

        next();
      });
    },
    closeBundle() {
      const outPath = path.resolve(process.cwd(), resolvedOutDir);
      if (!fs.existsSync(outPath)) return;

      const destImages = path.join(outPath, 'assets', 'images');
      copyDirRecursive(path.join(ASSETS_DIR, 'images'), destImages);

      ['maintenance.html', 'migration.html'].forEach((filename) => {
        const srcPath = path.join(PAGES_DIR, filename);
        if (!fs.existsSync(srcPath)) return;
        let content = fs.readFileSync(srcPath, 'utf8');
        content = content.replaceAll('../assets/images/', 'assets/images/');
        if (filename === 'migration.html') {
          if (options.from) content = content.replaceAll('old.example.com', options.from);
          if (options.to) content = content.replaceAll('new.example.com', options.to);
        }
        fs.writeFileSync(path.join(outPath, filename), content, 'utf8');
      });
    }
  };
};

export default statuskit;
