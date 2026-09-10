import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
mkdirSync('data', { recursive: true });
mkdirSync('config', { recursive: true });
if (!existsSync('.env')) copyFileSync('.env.example', '.env');
console.log('Local folders and .env ready. Follow docs/AUTH0-SETUP.md.');
