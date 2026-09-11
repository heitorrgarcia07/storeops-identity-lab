import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { PostgresUsers } from '../src/postgres.js';
import { createApp } from '../src/app.js';

// Runs actual PostgreSQL SQL in an embedded engine. Does not contact Render.
// Transport/TLS with the pg driver still needs a hosted smoke test.
async function database(path) {
    const engine = new PGlite(path);
    const query = async (sql, args) => {
        const result = await engine.query(sql, args);
        return { rows: result.rows, rowCount: result.affectedRows };
    };
    const pool = { query, connect: async () => ({ query, release() {} }), end: () => engine.close() };
    const users = new PostgresUsers(pool);
    await users.initialize();
    return users;
}
const token = 'test-only-provisioning-token-123456789';
const issuer = 'urn:test:idp';
const ana = JSON.parse(readFileSync(new URL('../config/ana-scim.json', import.meta.url), 'utf8'));
const enterprise = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
const envelope = Operations => ({ schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations });
const replace = (path, value) => ({ op: 'replace', path, value });
const profile = subject => ({ issuer, nameID: subject, email: 'jit@example.com', displayName: 'JIT User', storeId: '102' });

test('PostgreSQL: SCIM, JIT, identity link, deactivation, rollback and restart persistence', async t => {
    const path = mkdtempSync(join(tmpdir(), 'storeops-postgres-test-'));
    let users = await database(path);
    t.after(async () => { await users.close(); rmSync(path, { recursive: true, force: true }); });
    const adminToken = 'admin-postgres-test-abcdefghijklmnopqrstuvwxyz';
    const app = createApp({ users, adminToken, scimToken: token, issuer, jit: true, baseUrl: 'http://localhost:3000', entityId: 'urn:test:sp' });
    const post = body => request(app).post('/scim/v2/Users').set('Authorization', `Bearer ${token}`).send(body);
    const patch = (id, operations) => request(app).patch(`/scim/v2/Users/${id}`).set('Authorization', `Bearer ${token}`).send(envelope(operations));
    const metrics = () => request(app).post('/api/graphql').send({ query: '{ metrics { totalUsers activeUsers } }' });
    assert.equal((await metrics()).body.data.metrics.totalUsers, 0);
    await request(app).get('/scim/v2/Users').expect(401);
    const created = (await post(ana).expect(201)).body;
    await post({ ...ana, userName: ana.userName.toUpperCase() }).expect(409);
    const list = await request(app).get('/scim/v2/Users').query({ filter: `userName eq "${ana.userName.toUpperCase()}"` }).set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(list.body.totalResults, 1);
    assert.equal(list.body.Resources[0].id, created.id);
    await request(app).get('/scim/v2/Users/missing').set('Authorization', `Bearer ${token}`).expect(404);

    const jit = await users.login(profile('auth0|jit'), issuer, true);
    assert.equal(jit.created, true);
    const repeat = await users.login({ ...profile('auth0|jit'), email: 'changed@example.com' }, issuer, true);
    assert.equal(repeat.user.id, jit.user.id);
    assert.equal(repeat.created, false);
    await assert.rejects(users.login(profile('auth0|new'), issuer, false), /JIT disabled/);
    await assert.rejects(users.login({ ...profile('auth0|new'), storeId: '999' }, issuer, true), /Store not authorized/);
    const linkBody = { userId: created.id, subject: 'auth0|scim' };
    await request(app).post('/api/admin/identity-links').set('Authorization', `Bearer ${token}`).send(linkBody).expect(401);
    for (let attempt = 0; attempt < 2; attempt++) {
        await request(app).post('/api/admin/identity-links').set('Authorization', `Bearer ${adminToken}`).send(linkBody).expect(200);
    }
    await request(app).post('/api/admin/identity-links').set('Authorization', `Bearer ${adminToken}`).send({ ...linkBody, subject: 'auth0|jit' }).expect(409);
    const signedIn = await users.login(profile('auth0|scim'), issuer, true);
    assert.equal(signedIn.managedBy, 'SCIM');
    assert.equal(signedIn.user.id, created.id);
    assert.equal(signedIn.user.store_id, '101');
    assert.equal(signedIn.user.email, ana.emails[0].value);
    await assert.rejects(users.linkIdentity(created.id, issuer, 'auth0|other'), /different identity/);
    await assert.rejects(users.linkIdentity(created.id, issuer, 'auth0|jit'), /already belongs/);

    await patch(created.id, [replace('active', false)]).expect(200);
    await assert.rejects(users.login(profile('auth0|scim'), issuer, true), /Account inactive/);
    let counts = (await metrics().expect(200)).body.data.metrics;
    assert.deepEqual([counts.totalUsers, counts.activeUsers, counts.inactiveUsers], [2, 1, 1]);
    await patch(created.id, [replace('active', true), replace(`${enterprise}:department`, '102')]).expect(200);
    assert.equal((await users.get(created.id)).store_id, '102');
    const fetched = await request(app).get(`/scim/v2/Users/${created.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(fetched.body.active, true);
    assert.equal(fetched.body.meta.created, created.meta.created);
    await patch(created.id, [replace('active', false), replace(`${enterprise}:department`, '999')]).expect(400);
    assert.equal((await users.get(created.id)).active, 1);

    // Simulate a write failure after the SCIM representation update: both rows must roll back.
    await users.pool.query('ALTER TABLE users ADD CONSTRAINT test_reject_inactive CHECK (active=1)');
    await patch(created.id, [replace('active', false)]).expect(500);
    assert.equal((await users.get(created.id)).active, 1);
    assert.equal(JSON.parse((await users.scim.get(created.id)).resource).active, true);
    await users.pool.query('ALTER TABLE users DROP CONSTRAINT test_reject_inactive');
    // Force a duplicate at the storage layer, bypassing the route precheck.
    await assert.rejects(users.scim.create({ ...created, id: 'duplicate-at-storage' }, '101'));
    assert.equal(await users.get('duplicate-at-storage'), undefined);
    counts = (await metrics()).body.data.metrics;
    assert.deepEqual(counts.usersByStore, [{ storeId: '102', users: 2 }]);

    await users.close();
    users = await database(path);
    assert.equal((await users.get(created.id)).subject, 'auth0|scim');
    assert.equal((await users.metrics()).totalUsers, 2);
    assert.equal((await users.login(profile('auth0|scim'), issuer, true)).user.id, created.id);
});
