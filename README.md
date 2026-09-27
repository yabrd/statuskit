# StatusKit

Universal, minimalist, and responsive standby, maintenance, and migration status pages with seamless dark & light mode support.

## Features

- **Pure Monochrome Aesthetics:** Ultra-clean design fitting any brand or modern web application.
- **Dark & Light Mode:** Instant toggle without layout flash, synchronized with system OS preferences and localStorage.
- **Responsive Layout:** Optimized for mobile, tablet, and high-resolution desktop screens.
- **Zero-Bloat CLI:** Interactive or direct command to copy assets directly into your project (`./public`).
- **Smart Migration Host Detection:** Automatically adopts the current hostname if source domain is not provided.
- **Vite Plugin:** Optional zero-copy integration for Vite-powered SPAs.

## Installation

```bash
npm install git+https://github.com/yabrd/statuskit.git --save-dev
```

## CLI Usage (State Engine)

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
Activate domain migration notice (target `--to` domain is required):
```bash
npx @yabrd/statuskit migration --to=new.domain.com
```

### Options
Specify destination directory (defaults to `./public`):
```bash
npx statuskit maintenance ./dist
```

Customize source domain (optional, automatically defaults to runtime hostname):
```bash
npx statuskit migration --to=new.domain.com --from=old.domain.com
```

Keep HTML inside a `pages/` subfolder:
```bash
npx statuskit all --to=new.domain.com --pages
```

### Local Preview Server
Spin up a local zero-dependency preview server:
```bash
npx statuskit preview
```
Custom port:
```bash
npx statuskit preview --port=8080
```

## Vite Plugin Usage

In `vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { statuskit } from '@yabrd/statuskit/vite'

export default defineConfig({
  plugins: [
    vue(),
    statuskit({
      to: 'new.domain.com',
      from: 'old.domain.com'
    })
  ]
})
```

- During `npm run dev`, visit `/maintenance.html` or `/migration.html`.
- During `npm run build`, status pages and images are automatically emitted to `dist/`.

## Dynamic URL Parameters for Migration

The migration page dynamically adapts to any target domain on the fly via query parameters without code changes:
```text
https://your-domain.com/migration.html?to=new.domain.com
```

## Production Deployment Recipes

### Recipe 1: Nginx Maintenance Switch (Zero-Downtime Flag)
In your Nginx site configuration:
```nginx
server {
    server_name app.domain.com;
    root /var/www/app/dist;

    if (-f $document_root/maintenance.flag) {
        return 503;
    }

    error_page 503 /maintenance.html;
    location = /maintenance.html {
        internal;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
- **Activate maintenance:** `touch /var/www/app/dist/maintenance.flag`
- **Deactivate maintenance:** `rm /var/www/app/dist/maintenance.flag`

### Recipe 2: Frontend Route Guard (.env)
In `src/router/index.js`:
```javascript
router.beforeEach((to) => {
  if (import.meta.env.VITE_MAINTENANCE === 'true' && to.path !== '/maintenance.html') {
    window.location.href = '/maintenance.html';
    return false;
  }
});
```

### Recipe 3: Legacy Domain Migration Server
On the server hosting the decommissioned domain:
```nginx
server {
    server_name old.domain.com;
    root /var/www/legacy-domain;
    index migration.html;

    location / {
        try_files $uri /migration.html;
    }
}
```

## File Structure

```text
statuskit/
├── bin/
│   └── cli.js
├── src/
│   └── vite-plugin.js
├── pages/
│   ├── maintenance.html
│   └── migration.html
├── assets/
│   └── images/
│       ├── maintenance-dark.webp
│       ├── maintenance-light.webp
│       ├── migration-dark.webp
│       └── migration-light.webp
├── index.js
├── package.json
└── README.md
```

## License

MIT
