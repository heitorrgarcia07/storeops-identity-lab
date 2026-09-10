import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Users } from '../src/identity.js';

test('activity is browser-specific and excludes login credentials and protocol payloads', async () => {
    const users = new Users(':memory:');
    const saml = {
        async getAuthorizeUrlAsync(state) {
            const payload = deflateRawSync('<AuthnRequest ID="_test"/>').toString('base64');
            return `https://idp.example/login?RelayState=${state}&SAMLRequest=${encodeURIComponent(payload)}`;
        }
    };
    const app = createApp({ saml, users, issuer: 'urn:test', jit: true, baseUrl: 'http://localhost:3000', entityId: 'urn:storeops' });
    const login = await request(app).get('/auth/saml/login').expect(302);
    const activityCookie = login.headers['set-cookie'].find(value => value.startsWith('storeops_activity=')).split(';')[0];
    const own = await request(app).get('/activity/data').set('Cookie', activityCookie).expect(200);
    assert.equal(own.body.events.length, 3);
    assert.equal(own.body.events[2].event, 'auth0.redirect');
    const other = await request(app).get('/activity/data').expect(200);
    assert.deepEqual(other.body.events, []);
    const state = new URL(login.headers.location).searchParams.get('RelayState');
    assert.ok(!JSON.stringify(own.body).includes(state));
    assert.ok(!JSON.stringify(own.body).includes(activityCookie.split('=')[1]));
    await request(app).get('/activity').expect(200);
    const script = await request(app).get('/public/activity.js').expect(200);
    assert.match(script.text, /textContent/);
    users.db.close();
});
