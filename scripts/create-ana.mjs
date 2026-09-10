import 'dotenv/config';
import { readFileSync } from 'node:fs';

// This script plays the role of a provisioning client. Auth0 does not send this request.
const base = process.env.APP_BASE_URL || 'http://localhost:3000';
const url = new URL(base);
if (url.protocol !== 'http:' || url.hostname !== 'localhost') throw new Error('This exercise only sends requests to localhost.');
if (!process.env.SCIM_TOKEN) throw new Error('Run ./scripts/local.sh setup-scim first.');
const headers = { Authorization: `Bearer ${process.env.SCIM_TOKEN}`, 'Content-Type': 'application/scim+json' };
const payload = readFileSync('config/ana-scim.json', 'utf8');
console.log('1. Sending POST /scim/v2/Users with these user attributes (token hidden):');
console.log(payload);
const response = await fetch(`${base}/scim/v2/Users`, { method: 'POST', headers, body: payload });
const body = await response.json();
console.log(`2. Server returned HTTP ${response.status}`);
let resource = body;
if (response.status === 409) {
    console.log('Ana already exists. The server prevented a duplicate. Looking up the existing account.');
    const filter = encodeURIComponent(`userName eq "${JSON.parse(payload).userName}"`);
    const existing = await fetch(`${base}/scim/v2/Users?filter=${filter}`, { headers });
    if (!existing.ok) throw new Error('Could not look up existing account.');
    resource = (await existing.json()).Resources[0];
} else if (response.status !== 201) {
    console.log(body);
    process.exitCode = 1;
}
if (resource?.id && (response.status === 201 || response.status === 409)) {
    console.log('3. Reading the saved account with GET /scim/v2/Users/:id');
    const saved = await fetch(`${base}/scim/v2/Users/${encodeURIComponent(resource.id)}`, { headers });
    if (!saved.ok) throw new Error('Could not read saved account.');
    console.log(JSON.stringify(await saved.json(), null, 2));
    console.log('Account stored. This script did not sign in or create an Auth0 user.');
}
