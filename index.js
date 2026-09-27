import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PACKAGE_ROOT = path.resolve(__dirname);
export const PAGES_DIR = path.join(PACKAGE_ROOT, 'pages');
export const ASSETS_DIR = path.join(PACKAGE_ROOT, 'assets');
export const IMAGES_DIR = path.join(ASSETS_DIR, 'images');

export { statuskit } from './src/vite-plugin.js';
