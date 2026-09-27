# StatusKit

Universal, minimalist, and responsive standby, maintenance, and migration status state engine for modern web applications.

## Features

- **State-Driven Engine:** Switch between `LIVE`, `MAINTENANCE`, and `MIGRATION` modes with a single command.
- **Anti-Leakage Build Protection:** Vite builds during maintenance never leak new code until you explicitly run `up`.
- **Pure Monochrome Aesthetics:** Ultra-clean design fitting any brand or modern web application.
- **Dark & Light Mode:** Seamless toggle synchronized with system OS preferences and `localStorage`.
- **Zero-Dependency CLI:** Pure native Node.js without third-party bloat.

## Installation

```bash
npm install git+https://github.com/yabrd/statuskit.git --save-dev
```

## CLI Usage

### Switch Maintenance Mode
Turn ON maintenance mode (automatically backs up original `index.html` to `index.app.html` and activates maintenance):
```bash
npx @yabrd/statuskit down
```

Restore original live application:
```bash
npx @yabrd/statuskit up
```

Check current state (`LIVE`, `MAINTENANCE`, or `MIGRATION`):
```bash
npx @yabrd/statuskit status
```

### Switch Migration Mode
Activate domain migration notice:
```bash
npx @yabrd/statuskit migration sso.muallimin.sch.id
```

## Vite Plugin Usage (Anti-Leakage Protection)

In `vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { statuskit } from '@yabrd/statuskit/vite'

export default defineConfig({
  plugins: [
    vue(),
    statuskit()
  ]
})
```

- When the application is **LIVE**, `npm run build` produces a pristine `dist/` without maintenance files.
- When the application is in **MAINTENANCE** or **MIGRATION**, `npm run build` preserves the maintenance lock and stores the new application in `dist/index.app.html` until you run `up`.

## License

MIT © yabrd
