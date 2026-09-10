import { createApp } from './app.js';
import { Users } from './identity.js';
import { baseUrl, entityId, issuer, jit, makeSaml, missing } from './config.js';
import { connectPostgres } from './postgres.js';
const users = process.env.DATABASE_URL
    ? await connectPostgres(process.env.DATABASE_URL)
    : new Users('data/storeops.sqlite');
console.log(JSON.stringify({ event: 'database.ready', database: users.kind || 'SQLite' }));
const app = createApp({ saml: makeSaml(), users, issuer, jit, baseUrl, entityId, missing, scimToken: process.env.SCIM_TOKEN });
const port = Number(process.env.PORT || 3000);
const configuredPort = Number(new URL(baseUrl).port || 0);
if (configuredPort && configuredPort !== port)
    throw new Error('PORT must match APP_BASE_URL');
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => console.log(`StoreOps: ${baseUrl} — ${missing.length ? 'Auth0 setup pending' : 'SAML configured'}`));
