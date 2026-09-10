import 'dotenv/config';
import { existsSync } from 'node:fs';
import { Users } from '../src/identity.js';

const [id, subject, action] = process.argv.slice(2);
if (!id || !subject || (action && action !== '--apply')) {
    throw new Error('Usage: ./scripts/local.sh link-user LOCAL_USER_ID "AUTH0_USER_ID" [--apply]');
}
if (!process.env.IDP_ISSUER) throw new Error('Configure IDP_ISSUER in .env first.');
if (!existsSync('data/storeops.sqlite')) throw new Error('The local database does not exist.');
const users = new Users('data/storeops.sqlite');
try {
    const user = users.get(id);
    if (!user || !users.isScimManaged(id)) throw new Error('No SCIM account found with that local ID.');
    console.log(`Local account: ${user.name} | store ${user.store_id} | active=${Boolean(user.active)}`);
    console.log(`Local ID: ${id}`);
    console.log(`Auth0 subject: ${subject}`);
    console.log(`IdP issuer: ${process.env.IDP_ISSUER}`);
    if (action === '--apply') {
        users.linkIdentity(id, process.env.IDP_ISSUER, subject);
        console.log('Identity linked. Local account ID, profile, store and active status preserved.');
    } else {
        console.log('Preview only. No identity was changed. Add --apply to perform this link.');
    }
} finally {
    users.db.close();
}
