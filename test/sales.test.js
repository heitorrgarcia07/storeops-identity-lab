import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { Users } from '../src/identity.js';
import { PostgresUsers } from '../src/postgres.js';
import { createSalesRouter } from '../src/sales.js';

for (const backend of ['SQLite', 'PostgreSQL']) test(`${backend}: sales validation, retries, store isolation and revocation`, async t => {
    let users;
    if (backend === 'SQLite') {
        users = new Users(':memory:');
        t.after(() => users.db.close());
    } else {
        const engine = new PGlite();
        const query = async (sql, args) => { const r = await engine.query(sql, args); return { rows:r.rows, rowCount:r.affectedRows }; };
        users = new PostgresUsers({ query, connect:async () => ({ query, release() {} }) });
        await users.initialize();
        t.after(() => engine.close());
    }
    const profile = storeId => ({ issuer:'urn:test', nameID:`auth0|${storeId}`, email:`${storeId}@example.com`, displayName:'Demo', storeId });
    const a = (await users.login(profile('101'), 'urn:test', true)).user;
    const b = (await users.login(profile('102'), 'urn:test', true)).user;
    let current = a.id;
    const app = express();
    app.use(express.json());
    // Test-only session fixture. The production app uses its SAML session map.
    app.use(createSalesRouter({ sales:users.sales, getAccess:async () => current ? { session:{csrf:'test'}, user:await users.get(current) } : {} }));
    const post = body => request(app).post('/api/sales').set('x-csrf-token','test').send(body);
    const sale = { sale_id:randomUUID(), sale_date:'2026-09-11', amount_brl:'0.10' };
    await request(app).get('/sales').expect(200);
    await request(app).post('/api/sales').send(sale).expect(403);
    for (const invalid of [{store_id:'102'}, {sale_date:'2026-02-30'}, {amount_brl:'0'}, {amount_brl:'1.001'}, {amount_brl:10}, {sale_id:'invalid'}]) {
        await post({...sale,...invalid}).expect(400);
    }
    assert.equal((await request(app).get('/api/sales')).body.sales.length,0);
    const saved = (await post(sale).expect(201)).body;
    assert.equal(saved.amount_brl,'0.10');
    assert.equal(saved.store_id,'101');
    assert.equal(saved.created_by,undefined);
    assert.deepEqual((await post(sale).expect(200)).body,saved);
    await post({...sale,amount_brl:'0.20'}).expect(409);
    await request(app).get('/api/sales?store_id=102').expect(400);
    current = b.id;
    assert.equal((await request(app).get('/api/sales')).body.sales.length,0);
    await post(sale).expect(409);
    current = a.id;
    assert.equal((await request(app).get('/api/sales')).body.sales.length,1);
    if (backend === 'SQLite') users.db.prepare('UPDATE users SET active=0 WHERE id=?').run(a.id);
    else await users.pool.query('UPDATE users SET active=0 WHERE id=$1',[a.id]);
    await request(app).get('/api/sales').expect(401);
    await post({...sale,sale_id:randomUUID()}).expect(401);
    current = undefined;
    await request(app).get('/sales').expect(302);
    await request(app).get('/api/sales').expect(401);
});
