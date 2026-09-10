import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Users } from '../src/identity.js';

const token = 'test-only-provisioning-token-123456789';
const ana = JSON.parse(readFileSync(new URL('../config/ana-scim.json', import.meta.url), 'utf8'));
const department = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
const patchBody = Operations => ({ schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations });
const replace = (path, value) => ({ op: 'replace', path, value });
const patchRequest = (app, id, body) => request(app).patch(`/scim/v2/Users/${id}`).set('Authorization', `Bearer ${token}`).send(body);
function lab() {
    const users = new Users(':memory:');
    const app = createApp({ users, scimToken: token, issuer: 'urn:test:idp', jit: true, baseUrl: 'http://localhost:3000', entityId: 'urn:storeops' });
    const post = data => request(app).post('/scim/v2/Users').set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/scim+json').send(JSON.stringify(data));
    return { users, app, post };
}
test('explicit identity linking preserves account data and rejects conflicts and relinking', async () => {
    const { users, post } = lab();
    const first = (await post(ana)).body;
    const second = (await post({ ...ana, userName: 'another@example.com' })).body;
    const before = users.get(first.id);
    users.linkIdentity(first.id, 'urn:test:idp', 'auth0|one');
    users.linkIdentity(first.id, 'urn:test:idp', 'auth0|one');
    assert.deepEqual({ ...users.get(first.id) }, { ...before, issuer: 'urn:test:idp', subject: 'auth0|one' });
    assert.throws(() => users.linkIdentity(second.id, 'urn:test:idp', 'auth0|one'), /already belongs/);
    assert.throws(() => users.linkIdentity(first.id, 'urn:test:idp', 'auth0|two'), /different identity/);
    assert.throws(() => users.linkIdentity('missing', 'urn:test:idp', 'auth0|three'), /existing SCIM/);
    assert.equal(users.get(second.id).issuer, 'urn:storeops:unlinked-scim');
    assert.equal(users.db.prepare('SELECT count(*) AS n FROM users').get().n, 2);
    users.db.close();
});
test('SCIM creates a persisted account without a login or browser session; reads preserve its ID', async () => {
    const { users, app, post } = lab();
    const created = await post(ana).expect(201);
    assert.match(created.headers['content-type'], /application\/scim\+json/);
    assert.equal(created.headers['set-cookie'], undefined);
    assert.equal(users.get(created.body.id).store_id, '101');
    assert.equal(users.get(created.body.id).issuer, 'urn:storeops:unlinked-scim');
    assert.equal(created.body.externalId, ana.externalId);
    const fetched = await request(app).get(new URL(created.headers.location).pathname).set('Authorization', `Bearer ${token}`).expect(200);
    assert.deepEqual(fetched.body, created.body);
    await request(app).get('/dashboard').expect(302);
    users.db.close();
});
test('SCIM rejects absent or wrong credentials for writes and reads', async () => {
    const { users, app } = lab();
    await request(app).post('/scim/v2/Users').send(ana).expect(401);
    await request(app).get('/scim/v2/Users').set('Authorization', 'Bearer wrong').expect(401);
    assert.equal(users.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
    users.db.close();
});
test('duplicate userName is rejected case-insensitively and can be retrieved using a filter', async () => {
    const { users, app, post } = lab();
    const first = await post(ana).expect(201);
    const duplicate = await post({ ...ana, userName: ana.userName.toUpperCase() }).expect(409);
    assert.equal(duplicate.body.scimType, 'uniqueness');
    assert.equal(users.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
    const list = await request(app).get('/scim/v2/Users').query({ filter: `userName eq "${ana.userName}"` }).set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(list.body.totalResults, 1);
    assert.equal(list.body.Resources[0].id, first.body.id);
    users.db.close();
});
test('invalid schema, store and active type cause no partial account creation', async () => {
    const { users, post } = lab();
    await post({ ...ana, schemas: [] }).expect(400);
    await post({ ...ana, active: 'true' }).expect(400);
    await post({ ...ana, 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': { department: '999' } }).expect(400);
    assert.equal(users.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
    users.db.close();
});
test('malformed JSON returns a SCIM error instead of an HTML login error', async () => {
    const { users, app } = lab();
    const response = await request(app).post('/scim/v2/Users').set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/scim+json').send('{broken').expect(400);
    assert.equal(response.body.schemas[0], 'urn:ietf:params:scim:api:messages:2.0:Error');
    users.db.close();
});

test('PATCH updates SQLite and GET together while preserving identity and creation time', async () => {
    const { users, app, post } = lab();
    const created = (await post(ana).expect(201)).body;
    const before = users.get(created.id);
    const changed = (await patchRequest(app, created.id, patchBody([replace(`${department}:department`, '102')])).expect(200)).body;
    assert.equal(changed.id, created.id);
    assert.equal(changed.meta.created, created.meta.created);
    assert.ok(changed.meta.lastModified > created.meta.lastModified);
    assert.equal(users.get(created.id).store_id, '102');
    assert.equal(users.get(created.id).subject, before.subject);
    const get = await request(app).get(`/scim/v2/Users/${created.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    assert.deepEqual(get.body, changed);
    const repeated = await patchRequest(app, created.id, patchBody([replace(`${department}:department`, '102')])).expect(200);
    assert.deepEqual(repeated.body, changed);
    users.db.close();
});

test('PATCH can deactivate and reactivate the same provisioned account', async () => {
    const { users, app, post } = lab();
    const { id } = (await post(ana)).body;
    for (const active of [false, true]) {
        const response = await patchRequest(app, id, patchBody([replace('active', active)])).expect(200);
        assert.equal(response.body.active, active);
        assert.equal(users.get(id).active, Number(active));
    }
    users.db.close();
});

test('PATCH rejects an invalid later operation without saving an earlier valid one', async () => {
    const { users, app, post } = lab();
    const created = (await post(ana)).body;
    await patchRequest(app, created.id, patchBody([replace(`${department}:department`, '102'), replace('active', 'false')])).expect(400);
    assert.equal(users.get(created.id).store_id, '101');
    assert.deepEqual(JSON.parse(users.db.prepare('SELECT resource FROM scim_resources WHERE user_id=?').get(created.id).resource), created);
    // Force a storage failure after the first UPDATE to prove transaction rollback.
    users.db.exec("CREATE TRIGGER reject_update BEFORE UPDATE ON scim_resources BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await patchRequest(app, created.id, patchBody([replace('active', false)])).expect(500);
    assert.equal(users.get(created.id).active, 1);
    users.db.close();
});

test('PATCH requires credentials and rejects unknown resources, paths, stores and envelopes', async () => {
    const { users, app, post } = lab();
    const { id } = (await post(ana)).body;
    await request(app).patch(`/scim/v2/Users/${id}`).send(patchBody([replace('active', false)])).expect(401);
    await patchRequest(app, 'missing', patchBody([replace('active', false)])).expect(404);
    await patchRequest(app, id, patchBody([replace('id', 'new')])).expect(400);
    await patchRequest(app, id, patchBody([replace(`${department}:department`, '999')])).expect(400);
    await patchRequest(app, id, { Operations: [replace('active', false)] }).expect(400);
    await patchRequest(app, id, patchBody([])).expect(400);
    assert.equal(users.get(id).active, 1);
    users.db.close();
});
