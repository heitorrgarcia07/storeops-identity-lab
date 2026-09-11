import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Users } from '../src/identity.js';

function lab(t) {
    const users = new Users(':memory:');
    t.after(() => users.db.close());
    users.login({ issuer: 'urn:test', nameID: 'one', email: 'one@example.com', displayName: 'One', storeId: '101' }, 'urn:test', true);
    const app = createApp({ users, baseUrl: 'http://localhost:3000' });
    return { users, send: body => request(app).post('/api/graphql').send(body) };
}

test('GraphQL returns only selected fields and nested selections', async t => {
    const { send } = lab(t);
    const single = await send({ query: '{ metrics { activeUsers } }' }).expect(200);
    assert.deepEqual(single.body, { data: { metrics: { activeUsers: 1 } } });
    const nested = await send({ query: '{ metrics { usersByStore { storeId } } }' }).expect(200);
    assert.deepEqual(nested.body, { data: { metrics: { usersByStore: [{ storeId: '101' }] } } });
});

test('GraphQL validates fields, syntax, mutations and request types before reading storage', async t => {
    const { users, send } = lab(t);
    let reads = 0;
    users.metrics = () => { reads++; return {}; };
    for (const body of [
        { query: '{ metrics { unknownCount } }' },
        { query: '{ metrics {' },
        { query: 'mutation { metrics { activeUsers } }' },
        { query: 123 },
        { query: '{ metrics { activeUsers } }', variables: [] },
        { query: '{ metrics { activeUsers } }', operationName: 1 }
    ]) {
        const response = await send(body).expect(400);
        assert.ok(response.body.errors.length);
    }
    assert.equal(reads, 0);
});

test('GraphQL supports named operations, variables, directives, aliases and fragments', async t => {
    const { users, send } = lab(t);
    let reads = 0;
    const metrics = users.metrics.bind(users);
    users.metrics = () => { reads++; return metrics(); };
    const result = await send({
        query: `query Unused { metrics { inactiveUsers } }
                query Demo($includeTotal: Boolean!) {
                    first: metrics { ...Counts totalUsers @include(if: $includeTotal) }
                    second: metrics { activeUsers }
                }
                fragment Counts on Metrics { activeUsers }`,
        operationName: 'Demo', variables: { includeTotal: false }
    }).expect(200);
    assert.deepEqual(result.body.data, { first: { activeUsers: 1 }, second: { activeUsers: 1 } });
    assert.equal(reads, 1);
});

test('GraphQL masks database failures while returning a GraphQL execution error', async t => {
    const { users, send } = lab(t);
    users.metrics = async () => { throw new Error('private-database-password'); };
    const result = await send({ query: '{ metrics { activeUsers } }' }).expect(200);
    assert.equal(result.body.data, null);
    assert.equal(result.body.errors[0].message, 'Metrics are temporarily unavailable.');
    assert.ok(!JSON.stringify(result.body).includes('private-database-password'));
});
