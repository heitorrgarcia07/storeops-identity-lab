import { createApp } from './app.js';
import { Users } from './identity.js';
import { baseUrl, entityId, issuer, jit, makeSaml, missing } from './config.js';
const app = createApp({ saml: makeSaml(), users: new Users('data/storeops.sqlite'), issuer, jit, baseUrl, entityId, missing, scimToken: process.env.SCIM_TOKEN });
const port = Number(process.env.PORT || 3000);
const configuredPort = Number(new URL(baseUrl).port || 0);
if (configuredPort && configuredPort !== port)
    throw new Error('PORT must match APP_BASE_URL');
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => console.log(`StoreOps: ${baseUrl} — ${missing.length ? 'Auth0 setup pending' : 'SAML configured'}`));
