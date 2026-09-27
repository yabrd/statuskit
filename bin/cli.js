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
const STATE_FILENAME = '.statuskit.json';

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

const writeState = (baseDir, stateData) => {
  const filePath = path.join(baseDir, STATE_FILENAME);
  const cwdPath = path.join(process.cwd(), STATE_FILENAME);
  const payload = JSON.stringify(stateData, null, 2);

  try {
    fs.writeFileSync(filePath, payload, 'utf8');
    if (filePath !== cwdPath) {
      fs.writeFileSync(cwdPath, payload, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`\nWarning: Unable to write state file: ${error?.message ?? error}\n\n`);
  }
};

const removeState = (baseDir) => {
  const targetFiles = [
    path.join(baseDir, STATE_FILENAME),
    path.join(process.cwd(), STATE_FILENAME)
  ];

  targetFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
  });
};

const resolveAppDir = (explicitTarget) => {
  const cwd = process.cwd();
  if (explicitTarget) return path.resolve(cwd, explicitTarget);

  const candidates = ['dist', 'public_html', 'public'];
  for (const candidate of candidates) {
    const candidatePath = path.join(cwd, candidate);
    if (fs.existsSync(path.join(candidatePath, 'index.html')) || fs.existsSync(path.join(candidatePath, 'index.app.html'))) {
      return candidatePath;
    }
  }

  return cwd;
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

  if (firstArg === 'down') {
    options.action = 'down';
    remainingArgs.push(...rawArgs.slice(1));
  } else if (firstArg === 'up') {
    options.action = 'up';
    remainingArgs.push(...rawArgs.slice(1));
  } else if (firstArg === 'status') {
    options.action = 'status';
    remainingArgs.push(...rawArgs.slice(1));
  } else if (firstArg === 'migration') {
    options.action = 'migration';
    remainingArgs.push(...rawArgs.slice(1));
  } else if (firstArg === 'maintenance') {
    options.action = 'down';
    remainingArgs.push(...rawArgs.slice(1));
  } else if (firstArg === 'all') {
    options.action = 'install';
    options.type = 'all';
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
    if (arg.startsWith('--to=') || arg.startsWith('--domain=')) {
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
    if (!arg.startsWith('--')) {
      if (!options.to && (options.action === 'migration' || options.type === 'migration')) {
        options.to = arg.trim();
        return;
      }
      if (!options.target) {
        options.target = arg;
      }
    }
  });

  return options;
};

const executeDown = (options) => {
  const destination = resolveAppDir(options.target);
  const indexPath = path.join(destination, 'index.html');
  const backupPath = path.join(destination, 'index.app.html');
  const state = readState(destination);

  if (!fs.existsSync(indexPath) && !fs.existsSync(backupPath)) {
    process.stderr.write(`\nError: index.html not found in ${destination}\n\n`);
    process.exit(1);
  }

  if (fs.existsSync(backupPath) && state?.status === 'maintenance') {
    process.stdout.write(`\nNotice: Application is ALREADY in maintenance mode.\nTarget: ${destination}\n\n`);
    return;
  }

  if (fs.existsSync(indexPath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(indexPath, backupPath);
  }

  const templatePath = path.join(PAGES_DIR, 'maintenance.html');
  let content = fs.readFileSync(templatePath, 'utf8');
  content = content.replaceAll('../assets/images/', 'assets/images/');
  fs.writeFileSync(indexPath, content, 'utf8');

  const destImagesDir = path.join(destination, 'assets', 'images');
  fs.mkdirSync(destImagesDir, { recursive: true });
  ASSET_GROUPS.maintenance.forEach((imgName) => {
    copyFileWithDir(path.join(ASSETS_DIR, 'images', imgName), path.join(destImagesDir, imgName));
  });

  writeState(destination, {
    status: 'maintenance',
    target: path.relative(process.cwd(), destination) || '.',
    updatedAt: new Date().toISOString()
  });

  process.stdout.write(`\n\x1b[32m✓ Application is now in MAINTENANCE mode.\x1b[0m\n`);
  process.stdout.write(`  Target directory: ${destination}\n`);
  process.stdout.write(`  index.html -> replaced with Maintenance Page (original backed up to index.app.html)\n`);
  process.stdout.write(`  Run 'npx @yabrd/statuskit up' to restore the application.\n\n`);
};

const executeMigration = (options) => {
  if (!options.to) {
    process.stderr.write(`\nError: Target domain (--to=<new-domain>) is required for migration mode.\n`);
    process.stderr.write(`Example: npx @yabrd/statuskit migration --to=sso.muallimin.sch.id\n\n`);
    process.exit(1);
  }

  const destination = resolveAppDir(options.target);
  const indexPath = path.join(destination, 'index.html');
  const backupPath = path.join(destination, 'index.app.html');
  const state = readState(destination);

  if (fs.existsSync(backupPath) && state?.status === 'migration' && state?.to === options.to) {
    process.stdout.write(`\nNotice: Application is ALREADY in migration mode to ${options.to}.\nTarget: ${destination}\n\n`);
    return;
  }

  if (fs.existsSync(indexPath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(indexPath, backupPath);
  }

  const templatePath = path.join(PAGES_DIR, 'migration.html');
  let content = fs.readFileSync(templatePath, 'utf8');
  content = content.replaceAll('../assets/images/', 'assets/images/');
  content = content.replaceAll('new.example.com', options.to);
  if (options.from) {
    content = content.replaceAll('old.example.com', options.from);
  }
  fs.writeFileSync(indexPath, content, 'utf8');

  const destImagesDir = path.join(destination, 'assets', 'images');
  fs.mkdirSync(destImagesDir, { recursive: true });
  ASSET_GROUPS.migration.forEach((imgName) => {
    copyFileWithDir(path.join(ASSETS_DIR, 'images', imgName), path.join(destImagesDir, imgName));
  });

  writeState(destination, {
    status: 'migration',
    target: path.relative(process.cwd(), destination) || '.',
    to: options.to,
    from: options.from ?? null,
    updatedAt: new Date().toISOString()
  });

  process.stdout.write(`\n\x1b[32m✓ Application is now in MIGRATION mode.\x1b[0m\n`);
  process.stdout.write(`  Target directory: ${destination}\n`);
  process.stdout.write(`  Destination domain: ${options.to}\n`);
  process.stdout.write(`  Run 'npx @yabrd/statuskit up' to restore original index.html.\n\n`);
};

const executeUp = (options) => {
  const destination = resolveAppDir(options.target);
  const indexPath = path.join(destination, 'index.html');
  const backupPath = path.join(destination, 'index.app.html');

  if (!fs.existsSync(backupPath)) {
    removeState(destination);
    process.stdout.write(`\nNotice: Application is already LIVE (maintenance mode is not active).\nTarget: ${destination}\n\n`);
    return;
  }

  fs.copyFileSync(backupPath, indexPath);
  try {
    fs.unlinkSync(backupPath);
  } catch {}

  removeState(destination);

  process.stdout.write(`\n\x1b[32m✓ Application is now LIVE.\x1b[0m\n`);
  process.stdout.write(`  Target directory: ${destination}\n`);
  process.stdout.write(`  Original application restored from index.app.html.\n\n`);
};

const executeStatus = (options) => {
  const destination = resolveAppDir(options.target);
  const backupPath = path.join(destination, 'index.app.html');
  const state = readState(destination);

  process.stdout.write(`\nStatusKit Inspection:\n`);
  process.stdout.write(`  Target Directory: ${destination}\n`);

  if (!fs.existsSync(backupPath) && (!state || state.status === 'live')) {
    process.stdout.write(`  Current Status:   \x1b[32mLIVE\x1b[0m (Application is fully operational)\n\n`);
    return;
  }

  const currentMode = state?.status?.toUpperCase() ?? 'MAINTENANCE';
  process.stdout.write(`  Current Status:   \x1b[33m${currentMode}\x1b[0m\n`);
  if (state?.to) {
    process.stdout.write(`  Migration Target: ${state.to}\n`);
  }
  if (state?.updatedAt) {
    process.stdout.write(`  Activated At:     ${state.updatedAt}\n`);
  }
  process.stdout.write(`  Backup Exists:    ${fs.existsSync(backupPath) ? 'Yes (index.app.html)' : 'No'}\n\n`);
};

const executeInstall = (options) => {
  if (options.type === 'migration' && !options.to) {
    process.stderr.write(`\nError: Target domain (--to=<new-domain>) is required for migration page.\n`);
    process.stderr.write(`Example: npx @yabrd/statuskit migration --to=new.domain.com\n\n`);
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

What would you like to do?
  1) Activate Maintenance mode (down)
  2) Restore Application (up)
  3) Check Current Status (status)
  4) Install static pages only
\n`);

  rl.question('Select option [1-4] (default: 1): ', (answer) => {
    const choice = answer.trim();

    if (choice === '2') {
      rl.close();
      executeUp(options);
      return;
    }

    if (choice === '3') {
      rl.close();
      executeStatus(options);
      return;
    }

    if (choice === '4') {
      rl.close();
      executeInstall(options);
      return;
    }

    rl.close();
    executeDown(options);
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
Universal, lightweight maintenance & migration state engine for web applications.

Usage:
  npx @yabrd/statuskit [command] [options]

Commands:
  down [dir]            Activate MAINTENANCE mode (swaps index.html -> maintenance)
  up [dir]              Deactivate maintenance and restore original application
  status [dir]          Inspect current application status (LIVE, MAINTENANCE, MIGRATION)
  migration [dir]       Activate MIGRATION mode (--to=<domain> is required)
  preview               Start local server to preview pages in browser
  help                  Show this help message

Options:
  --to=<domain>         Target new domain (required for migration)
  --from=<domain>       Source old domain (optional, defaults to runtime hostname)
  --pages               Keep HTML inside 'pages/' subfolder instead of root
  --port=<port>         Set custom port for preview (default: 3333)

Examples:
  npx @yabrd/statuskit down
  npx @yabrd/statuskit up
  npx @yabrd/statuskit status
  npx @yabrd/statuskit migration --to=sso.muallimin.sch.id
  npx @yabrd/statuskit preview
\n`);
};

const main = () => {
  const options = parseArgs();

  if (options.action === 'interactive') {
    runInteractive(options);
    return;
  }

  if (options.action === 'down') {
    executeDown(options);
    return;
  }

  if (options.action === 'up') {
    executeUp(options);
    return;
  }

  if (options.action === 'status') {
    executeStatus(options);
    return;
  }

  if (options.action === 'migration') {
    executeMigration(options);
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
