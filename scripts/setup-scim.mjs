import 'dotenv/config';
import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!process.env.SCIM_TOKEN) {
    appendFileSync('.env', `\nSCIM_TOKEN=${randomBytes(32).toString('hex')}\n`);
    console.log('Created a provisioning token in .env. Its value is not printed. Restart DemoMart.');
} else {
    console.log('SCIM_TOKEN already exists. No changes made.');
}
