#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(PACKAGE_ROOT, 'pages');
const ASSETS_DIR = path.join(PACKAGE_ROOT, 'assets');

const DEFAULT_PORT = 3333;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const ASSET_GROUPS = {
  maintenance: ['maintenance-dark.webp', 'maintenance-light.webp'],
  migration: ['migration-dark.webp', 'migration-light.webp']
};

const copyFileWithDir = (src, dest) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
};

const resolveTargetDir = (explicitTarget) => {
  const cwd = process.cwd();
  if (explicitTarget) return path.resolve(cwd, explicitTarget);

  const publicCandidate = path.join(cwd, 'public');
  if (fs.existsSync(publicCandidate)) return publicCandidate;

  return cwd;
};

const parseArgs = () => {
  const rawArgs = process.argv.slice(2);
  const firstArg = rawArgs[0] ?? '';

  const options = {
    action: '',
    type: 'all',
    target: null,
    from: null,
    to: null,
    flat: true,
    port: DEFAULT_PORT
  };

  const remainingArgs = [];

  if (firstArg === 'maintenance' || firstArg === 'migration' || firstArg === 'all') {
    options.action = 'install';
    options.type = firstArg;
    remainingArgs.push(...rawArgs.slice(1));
  } else if (firstArg === 'preview') {
    options.action = 'preview';
    remainingArgs.push(...rawArgs.slice(1));
  } else if (firstArg === 'help' || firstArg === '--help' || firstArg === '-h') {
    options.action = 'help';
  } else if (firstArg === '') {
    options.action = 'interactive';
  } else {
    options.action = 'install';
    options.type = 'all';
    remainingArgs.push(...rawArgs);
  }

  remainingArgs.forEach((arg) => {
    if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1].trim();
      return;
    }
    if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1].trim();
      return;
    }
    if (arg === '--pages') {
      options.flat = false;
      return;
    }
    if (arg.startsWith('--port=')) {
      const parsedPort = Number.parseInt(arg.split('=')[1], 10);
      if (!Number.isNaN(parsedPort)) options.port = parsedPort;
      return;
    }
    if (!arg.startsWith('--') && !options.target) {
      options.target = arg;
    }
  });

  return options;
};

const executeInstall = (options) => {
  if (options.type === 'migration' && !options.to) {
    process.stderr.write(`\nError: Target domain (--to=<new-domain>) is required for migration page.\n`);
    process.stderr.write(`Example: npx statuskit migration --to=new.domain.com\n\n`);
    process.exit(1);
  }

  const destination = resolveTargetDir(options.target);
  fs.mkdirSync(destination, { recursive: true });

  const destImagesDir = path.join(destination, 'assets', 'images');
  fs.mkdirSync(destImagesDir, { recursive: true });

  const selectedPages = [];
  const selectedImages = [];

  if (options.type === 'maintenance' || options.type === 'all') {
    selectedPages.push('maintenance.html');
    selectedImages.push(...ASSET_GROUPS.maintenance);
  }

  if (options.type === 'migration' || options.type === 'all') {
    selectedPages.push('migration.html');
    selectedImages.push(...ASSET_GROUPS.migration);
  }

  selectedImages.forEach((imgName) => {
    const src = path.join(ASSETS_DIR, 'images', imgName);
    const dest = path.join(destImagesDir, imgName);
    copyFileWithDir(src, dest);
  });

  const htmlTargetDir = options.flat ? destination : path.join(destination, 'pages');
  fs.mkdirSync(htmlTargetDir, { recursive: true });

  selectedPages.forEach((filename) => {
    const sourcePath = path.join(PAGES_DIR, filename);
    if (!fs.existsSync(sourcePath)) return;

    let content = fs.readFileSync(sourcePath, 'utf8');

    if (options.flat) {
      content = content.replaceAll('../assets/images/', 'assets/images/');
    }

    if (filename === 'migration.html') {
      if (options.from) {
        content = content.replaceAll('old.example.com', options.from);
      }
      if (options.to) {
        content = content.replaceAll('new.example.com', options.to);
      }
    }

    const outputPath = path.join(htmlTargetDir, filename);
    fs.writeFileSync(outputPath, content, 'utf8');
  });

  process.stdout.write(`\nStatusKit setup complete!\n`);
  process.stdout.write(`- Mode:        ${options.type.toUpperCase()}\n`);
  process.stdout.write(`- Destination: ${destination}\n`);
  process.stdout.write(`- Pages:       ${htmlTargetDir} (${selectedPages.join(', ')})\n`);
  process.stdout.write(`- Assets:      ${destImagesDir} (${selectedImages.length} images)\n\n`);
};

const runInteractive = (options) => {
  if (!process.stdin.isTTY) {
    executeInstall(options);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  process.stdout.write(`
StatusKit Setup
Universal, minimal standby & maintenance pages.

Which page do you want to install?
  1) Maintenance page
  2) Migration page
  3) Both pages
\n`);

  rl.question('Select option [1-3] (default: 1): ', (answer) => {
    const choice = answer.trim();

    if (choice === '2' || choice === '3') {
      options.type = choice === '2' ? 'migration' : 'all';
      rl.question('New domain target [e.g. app.newdomain.com] (required): ', (toAnswer) => {
        const trimmedTo = toAnswer.trim();
        if (!trimmedTo) {
          process.stderr.write('\nError: New domain target is required.\n\n');
          rl.close();
          process.exit(1);
        }
        options.to = trimmedTo;

        rl.question('Old domain [e.g. app.olddomain.com] (optional, press Enter to auto-detect): ', (fromAnswer) => {
          const trimmedFrom = fromAnswer.trim();
          if (trimmedFrom) options.from = trimmedFrom;
          rl.close();
          executeInstall(options);
        });
      });
      return;
    }

    options.type = 'maintenance';
    rl.close();
    executeInstall(options);
  });
};

const runPreview = (options) => {
  const port = options.port;
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const reqPath = parsedUrl.pathname;

    if (reqPath === '/' || reqPath === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>StatusKit Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #000; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    h1 { font-size: 2.5rem; margin-bottom: 2rem; }
    .links { display: flex; gap: 1.5rem; }
    a { padding: 0.85rem 1.75rem; border: 1px solid #444; border-radius: 9999px; color: #fff; text-decoration: none; font-weight: 600; transition: background 0.2s; }
    a:hover { background: #222; }
  </style>
</head>
<body>
  <h1>StatusKit Preview</h1>
  <div class="links">
    <a href="/pages/maintenance.html" target="_blank">Maintenance Page</a>
    <a href="/pages/migration.html" target="_blank">Migration Page</a>
  </div>
</body>
</html>`);
      return;
    }

    const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(PACKAGE_ROOT, safePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    process.stdout.write(`\nStatusKit Preview Server running at: http://localhost:${port}\n`);
    process.stdout.write(`- Maintenance: http://localhost:${port}/pages/maintenance.html\n`);
    process.stdout.write(`- Migration:   http://localhost:${port}/pages/migration.html\n\n`);
  });
};

const showHelp = () => {
  process.stdout.write(`
StatusKit CLI
Universal, lightweight maintenance & migration pages for web applications.

Usage:
  npx statuskit [command] [options]

Commands:
  (no args)             Interactive wizard to install selected pages
  maintenance [dir]     Install maintenance page and cable assets (default: ./public)
  migration [dir]       Install migration page and diagram assets (default: ./public)
  all [dir]             Install both maintenance & migration pages
  preview               Start local server to preview pages in browser
  help                  Show this help message

Options:
  --to=<domain>         Target new domain (required for migration)
  --from=<domain>       Source old domain (optional, defaults to runtime hostname)
  --pages               Keep HTML inside 'pages/' subfolder instead of root
  --port=<port>         Set custom port for preview (default: 3333)

Examples:
  npx statuskit
  npx statuskit maintenance
  npx statuskit migration --to=new.app.com
  npx statuskit migration ./public --from=old.app.com --to=new.app.com
  npx statuskit preview
\n`);
};

const main = () => {
  const options = parseArgs();

  if (options.action === 'interactive') {
    runInteractive(options);
    return;
  }

  if (options.action === 'install') {
    executeInstall(options);
    return;
  }

  if (options.action === 'preview') {
    runPreview(options);
    return;
  }

  showHelp();
};

main();
