import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import request from 'supertest';
import { Users } from '../src/identity.js';
import { createApp } from '../src/app.js';
const dir = mkdtempSync(`${tmpdir()}/storeops-test-`);
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/key.pem`, '-out', `${dir}/cert.pem`, '-subj', '/CN=StoreOps-Test-Only', '-days', '1'], { stdio: 'ignore' });
process.env.IDP_SSO_URL = 'https://idp.example/samlp/test';
process.env.IDP_ISSUER = 'urn:test:idp';
process.env.IDP_CERT_PATH = `${dir}/cert.pem`;
process.env.APP_BASE_URL = 'http://localhost:3000';
const { makeSaml } = await import('../src/config.js');
const key = readFileSync(`${dir}/key.pem`, 'utf8'), cert = readFileSync(`${dir}/cert.pem`, 'utf8');
after(() => rmSync(dir, { recursive: true, force: true }));
const baseUrl = 'http://localhost:3000', issuer = 'urn:test:idp', entityId = 'urn:storeops:local';
function lab(jit = true) {
    const users = new Users(':memory:');
    return { users, app: createApp({ saml: makeSaml(), users, issuer, jit, baseUrl, entityId }) };
}
test('linked SCIM identity signs in without overwriting provisioning data and is blocked after SCIM deactivation', async () => {
    const users = new Users(':memory:');
    const scimToken = 'test-scim-linking-token-123456789012345';
    const app = createApp({ saml: makeSaml(), users, issuer, jit: false, baseUrl, entityId, scimToken });
    const payload = JSON.parse(readFileSync(new URL('../config/ana-scim.json', import.meta.url), 'utf8'));
    const created = await request(app).post('/scim/v2/Users').set('Authorization', `Bearer ${scimToken}`).send(payload).expect(201);
    const id = created.body.id;
    users.linkIdentity(id, issuer, 'auth0|alice');
    const { finish } = await authenticate(app, { store: '102', email: 'different@example.com' });
    assert.equal(finish.status, 302);
    const session = finish.headers['set-cookie'].find(s => s.startsWith('storeops_session=')).split(';')[0];
    const dashboard = await request(app).get('/dashboard').set('Cookie', session).expect(200);
    assert.match(dashboard.text, /SCIM account preserved/);
    assert.match(dashboard.text, /Store 101/);
    assert.equal(users.get(id).email, payload.emails[0].value);
    assert.equal(users.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
    await request(app).patch(`/scim/v2/Users/${id}`).set('Authorization', `Bearer ${scimToken}`).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }]
    }).expect(200);
    await request(app).get('/dashboard').set('Cookie', session).expect(302);
    assert.equal((await authenticate(app)).finish.status, 400);
    assert.equal(users.get(id).active, 0);
    assert.equal(users.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
    users.db.close();
});
function response(id, options = {}) {
    const now = new Date().toISOString();
    const until = new Date(Date.now() + (options.expired ? -60_000 : 240_000)).toISOString();
    const assertion = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomUUID()}" Version="2.0" IssueInstant="${now}"><saml:Issuer>${options.issuer || issuer}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${options.subject || 'auth0|alice'}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${id}" Recipient="${options.recipient || baseUrl + '/auth/saml/acs'}" NotOnOrAfter="${until}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${new Date(Date.now() - 120_000).toISOString()}" NotOnOrAfter="${until}"><saml:AudienceRestriction><saml:Audience>${options.audience || entityId}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now}" SessionIndex="_session"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement>${Object.entries({ email: options.email || 'alice@example.com', displayName: 'Alice', storeId: options.store ?? '101' }).map(([k, v]) => `<saml:Attribute Name="${k}"><saml:AttributeValue xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema" xsi:type="xs:string">${v}</saml:AttributeValue></saml:Attribute>`).join('')}</saml:AttributeStatement></saml:Assertion>`;
    const sig = new SignedXml({ privateKey: key, publicCert: cert, signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#' });
    sig.addReference({ xpath: "//*[local-name(.)='Assertion']", transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'], digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
    sig.computeSignature(assertion, { location: { reference: "//*[local-name(.)='Issuer']", action: 'after' } });
    let signed = options.unsigned ? assertion : sig.getSignedXml();
    if (options.tampered)
        signed = signed.replace('Alice', 'Mallory');
    return Buffer.from(`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_${randomUUID()}" Version="2.0" IssueInstant="${now}" InResponseTo="${id}" Destination="${baseUrl}/auth/saml/acs"><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${signed}</samlp:Response>`).toString('base64');
}
async function begin(app) {
    const login = await request(app).get('/auth/saml/login').expect(302);
    const url = new URL(login.headers.location);
    const xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest'), 'base64')).toString();
    return { id: xml.match(/\bID="([^"]+)"/)[1], state: url.searchParams.get('RelayState'), cookie: login.headers['set-cookie'].find(value => value.startsWith('storeops_flow=')).split(';')[0] };
}
async function authenticate(app, options = {}) {
    const flow = await begin(app);
    const post = await request(app).post('/auth/saml/acs').type('form').send({ RelayState: flow.state, SAMLResponse: response(flow.id, options) }).expect(303);
    const finish = await request(app).get(post.headers.location).set('Cookie', flow.cookie);
    return { finish, flow, post };
}
test('configuration screen is usable without IdP credentials; protected page redirects', async () => {
    const users = new Users(':memory:');
    const app = createApp({ users, issuer, jit: true, baseUrl, entityId });
    await request(app).get('/').expect(200);
    await request(app).get('/dashboard').expect(302);
    await request(app).get('/auth/saml/login').expect(503);
    users.db.close();
});
test('signed SAML creates JIT user; repeat login/email change preserves ID; logout is CSRF protected', async () => {
    const { app, users } = lab();
    const { finish } = await authenticate(app);
    assert.equal(finish.status, 302);
    const session = finish.headers['set-cookie'].find((s) => s.startsWith('storeops_session=')).split(';')[0];
    const dashboard = await request(app).get('/dashboard?storeId=102').set('Cookie', session).expect(200);
    assert.match(dashboard.text, /Store 101/);
    assert.doesNotMatch(dashboard.text, /Store 102/);
    const original = users.db.prepare('SELECT * FROM users').get();
    await authenticate(app, { email: 'new@example.com' });
    const updated = users.db.prepare('SELECT * FROM users').get();
    assert.equal(updated.id, original.id);
    assert.equal(updated.email, 'new@example.com');
    assert.equal(users.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
    await request(app).post('/logout').set('Cookie', session).type('form').send({ csrf: 'bad' }).expect(403);
    const csrf = dashboard.text.match(/name="csrf" value="([^"]+)"/)[1];
    await request(app).post('/logout').set('Cookie', session).type('form').send({ csrf }).expect(302);
    await request(app).get('/dashboard').set('Cookie', session).expect(302);
    users.db.close();
});
for (const [name, options] of Object.entries({
    'wrong audience': { audience: 'urn:other' }, 'expired assertion': { expired: true },
    'wrong recipient': { recipient: 'https://wrong.example/acs' }, 'unsigned assertion': { unsigned: true },
    'tampered signature': { tampered: true }, 'wrong issuer': { issuer: 'urn:other:idp' }
}))
    test(`rejects ${name} without creating account`, async () => {
        const { app, users } = lab();
        const flow = await begin(app);
        await request(app).post('/auth/saml/acs').type('form').send({ RelayState: flow.state, SAMLResponse: response(flow.id, options) }).expect(400);
        assert.equal(users.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
        users.db.close();
    });
test('browser binding and one-time completion prevent login reuse', async () => {
    const { app, users } = lab();
    const flow = await begin(app);
    const payload = { RelayState: flow.state, SAMLResponse: response(flow.id) };
    const post = await request(app).post('/auth/saml/acs').type('form').send(payload).expect(303);
    await request(app).get(post.headers.location).expect(400);
    await request(app).get(post.headers.location).set('Cookie', flow.cookie).expect(302);
    await request(app).get(post.headers.location).set('Cookie', flow.cookie).expect(400);
    await request(app).post('/auth/saml/acs').type('form').send(payload).expect(400);
    users.db.close();
});
test('response cannot be moved to a different RelayState', async () => {
    const { app, users } = lab();
    const first = await begin(app), second = await begin(app);
    await request(app).post('/auth/saml/acs').type('form').send({ RelayState: second.state, SAMLResponse: response(first.id) }).expect(400);
    users.db.close();
});
test('JIT disabled and invalid stores reject new accounts', async () => {
    const disabled = lab(false);
    assert.equal((await authenticate(disabled.app)).finish.status, 400);
    disabled.users.db.close();
    const invalid = lab();
    assert.equal((await authenticate(invalid.app, { store: '999' })).finish.status, 400);
    invalid.users.db.close();
});
test('inactive accounts stay inactive, including existing sessions', async () => {
    const { app, users } = lab();
    const { finish } = await authenticate(app);
    const session = finish.headers['set-cookie'].find((s) => s.startsWith('storeops_session=')).split(';')[0];
    users.db.exec('UPDATE users SET active=0');
    await request(app).get('/dashboard').set('Cookie', session).expect(302);
    assert.equal((await authenticate(app)).finish.status, 400);
    assert.equal(users.db.prepare('SELECT active FROM users').get().active, 0);
    users.db.close();
});
