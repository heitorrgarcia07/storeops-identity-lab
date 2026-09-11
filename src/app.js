import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { IdentityError } from './identity.js';
import { renderPage } from './pages.js';
import { createTrace, record } from './activity.js';
import { createScimRouter } from './scim.js';
import { createAdminRouter } from './admin.js';
import { metricsHandler } from './metrics-graphql.js';
import { createSalesRouter } from './sales.js';
const token = () => randomBytes(32).toString('hex');
const cookie = (req, key) => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${key}=`))?.slice(key.length + 1);
export function createApp(opts) {
    const app = express();
    const flows = new Map();
    const sessions = new Map();
    const traces = new Map();
    app.disable('x-powered-by');
    app.use('/public', express.static(new URL('../public', import.meta.url).pathname));
    app.use((req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
        for (const [key, trace] of traces) if (trace.expires < Date.now()) traces.delete(key);
        for (const [k, v] of flows)
            if (v.expires < Date.now())
                flows.delete(k);
        for (const [k, v] of sessions)
            if (v.expires < Date.now())
                sessions.delete(k);
        next();
    });
    app.use('/api/admin', createAdminRouter({ users: opts.users, token: opts.adminToken, scimToken: opts.scimToken, issuer: opts.issuer }));
    app.use(express.urlencoded({ extended: false, limit: '256kb' }));
    app.use(express.json({ limit: '64kb', type: ['application/json', 'application/graphql+json'] }));
    app.use('/scim/v2', createScimRouter({ users: opts.users, token: opts.scimToken, baseUrl: opts.baseUrl }));
    app.post('/api/graphql', metricsHandler(opts.users));
    const salesRouter = createSalesRouter({ sales: opts.users.sales, getAccess: async req => {
        const session = sessions.get(cookie(req, 'storeops_session') || '');
        const user = session && await opts.users.get(session.userId);
        return { session, user };
    } });
    // Restrict this router's authentication middleware to sales paths.
    app.use((req, res, next) => ['/sales', '/api/sales'].includes(req.path) ? salesRouter(req, res, next) : next());
    app.get('/activity', (_req, res) => res.send(renderPage('activity', 'Login activity')));
    app.get('/activity/data', (req, res) => {
        const trace = traces.get(cookie(req, 'storeops_activity'));
        res.json({ traceId: trace?.id || null, events: trace?.events || [] });
    });
    app.get('/metrics', (_req, res) => res.send(renderPage('metrics', 'Metrics Widget')));
    app.get('/', (_req, res) => res.send(renderPage('home', 'Welcome', {
        heading: opts.saml ? 'Auth0 configuration loaded' : 'Let’s connect Auth0',
        description: opts.saml ? 'Start here to sign in securely with your identity provider.' : 'Connect your identity provider to enable single sign-on for your store team.',
        actionUrl: opts.saml ? '/auth/saml/login' : '/setup',
        actionLabel: opts.saml ? 'Sign in with SSO' : 'View setup'
    })));
    app.get('/setup', (_req, res) => res.send(renderPage('setup', 'Setup', {
        callbackUrl: `${opts.baseUrl}/auth/saml/acs`,
        entityId: opts.entityId,
        status: opts.saml ? 'Configuration loaded. A live sign-in still needs to be verified.' : `Missing: ${(opts.missing || []).join(', ')}`
    })));
    app.get('/auth/saml/login', async (req, res, next) => {
        try {
            if (!opts.saml)
                return res.status(503).send(renderPage('pending', 'Setup pending'));
            if (flows.size >= 1000)
                return res.sendStatus(429);
            const state = token(), browser = token();
            const traceKey = token();
            const trace = createTrace();
            if (traces.size >= 500) traces.delete(traces.keys().next().value);
            traces.set(traceKey, trace);
            req.loginTrace = trace;
            res.cookie('storeops_activity', traceKey, { httpOnly: true, sameSite: 'lax', maxAge: 3_600_000, path: '/' });
            record(trace, 'login.started', '1 · Login requested', 'Your browser asked the DemoMart backend to start a login.');
            const redirect = await opts.saml.getAuthorizeUrlAsync(state, undefined, {});
            const xml = inflateRawSync(Buffer.from(new URL(redirect).searchParams.get('SAMLRequest'), 'base64')).toString();
            const requestId = xml.match(/\bID="([^"]+)"/)?.[1];
            if (!requestId)
                throw new Error('Missing generated request ID');
            flows.set(state, { browser, requestId, trace, expires: Date.now() + 300_000 });
            res.cookie('storeops_flow', browser, { httpOnly: true, sameSite: 'lax', maxAge: 300_000, path: '/' });
            record(trace, 'saml.request.created', '2 · SAML request created', 'DemoMart saved a short-lived request so it can match the response to this login.');
            record(trace, 'auth0.redirect', '3 · Browser sent to Auth0', 'Auth0 handles authentication and the Post Login Action. DemoMart cannot see those internal steps; it is waiting for a response.', 'waiting');
            res.redirect(redirect);
        }
        catch (err) {
            next(err);
        }
    });
    app.post('/auth/saml/acs', async (req, res, next) => {
        try {
            if (!opts.saml)
                return res.sendStatus(503);
            const state = req.body.RelayState;
            const flow = typeof state === 'string' ? flows.get(state) : undefined;
            req.loginTrace = flow?.trace;
            if (!flow || flow.profile || typeof req.body.SAMLResponse !== 'string')
                throw new IdentityError('Missing or expired login request');
            record(flow.trace, 'saml.response.received', '4 · Response received', 'The browser delivered a SAML response to POST /auth/saml/acs. It is not trusted until validation succeeds.');
            const { profile, loggedOut } = await opts.saml.validatePostResponseAsync({ SAMLResponse: req.body.SAMLResponse });
            if (!profile || loggedOut || profile.issuer !== opts.issuer)
                throw new IdentityError('Invalid identity response');
            // Inspect only the assertion already signature-validated by node-saml.
            const assertion = profile.getAssertion?.()?.Assertion;
            const confirmations = assertion?.Subject?.[0]?.SubjectConfirmation;
            const confirmation = confirmations?.length === 1 ? confirmations[0] : undefined;
            const data = confirmation?.SubjectConfirmationData?.[0]?.$;
            if (confirmation?.$?.Method !== 'urn:oasis:names:tc:SAML:2.0:cm:bearer' ||
                data?.Recipient !== `${opts.baseUrl}/auth/saml/acs` ||
                data?.InResponseTo !== flow.requestId || profile.inResponseTo !== flow.requestId ||
                !data?.NotOnOrAfter || !Number.isFinite(Date.parse(data.NotOnOrAfter)) || Date.parse(data.NotOnOrAfter) <= Date.now() - 5000) {
                throw new IdentityError('Invalid subject confirmation');
            }
            flow.profile = profile;
            record(flow.trace, 'saml.validated', '5 · SAML checks passed', 'Signature, issuer, audience, timing, recipient and request correlation were accepted.');
            // Cross-site POST omits SameSite=Lax cookies. Bind the browser on the following GET.
            res.redirect(303, `/auth/saml/finish?state=${encodeURIComponent(state)}`);
        }
        catch (err) {
            next(err);
        }
    });
    app.get('/auth/saml/finish', async (req, res, next) => {
        try {
            const state = typeof req.query.state === 'string' ? req.query.state : '';
            const flow = flows.get(state);
            req.loginTrace = flow?.trace;
            if (!flow?.profile || flow.browser !== cookie(req, 'storeops_flow'))
                throw new IdentityError('Browser does not match login request');
            record(flow.trace, 'browser.verified', '6 · Browser verified', 'The browser finishing this login matches the browser that started it.');
            flows.delete(state);
            record(flow.trace, 'identity.checking', '7 · Checking account and attributes', 'DemoMart looks up the identity and checks email, displayName, storeId and local account status.');
            const result = await opts.users.login(flow.profile, opts.issuer, opts.jit);
            if (result.managedBy === 'SCIM') {
                record(flow.trace, 'account.scim.preserved', '8 · SCIM account recognized', 'The linked account was found. SAML authenticated the identity; the profile, store and active status managed by SCIM were preserved.');
            } else {
                record(flow.trace, result.created ? 'jit.created' : 'account.updated', result.created ? '8 · Account created with JIT' : '8 · Existing account updated', result.created ? 'A new account was saved in the database.' : 'The same account was preserved. Its name, email and assigned store were refreshed from this login.');
            }
            const sessionId = token();
            const old = cookie(req, 'storeops_session');
            if (old)
                sessions.delete(old);
            sessions.set(sessionId, { userId: result.user.id, trace: flow.trace, expires: Date.now() + 3_600_000, csrf: token(), created: result.created, managedBy: result.managedBy });
            res.clearCookie('storeops_flow', { path: '/' });
            res.cookie('storeops_session', sessionId, { httpOnly: true, sameSite: 'lax', maxAge: 3_600_000, path: '/' });
            record(flow.trace, 'session.created', '9 · DemoMart session created', 'The backend saved a one-hour session and sent an HTTP-only cookie to the browser. The cookie value is not logged.');
            res.redirect('/dashboard');
        }
        catch (err) {
            next(err);
        }
    });
    app.get('/dashboard', async (req, res) => {
        const session = sessions.get(cookie(req, 'storeops_session') || '');
        const user = session && await opts.users.get(session.userId);
        if (!user?.active || !session)
            return res.redirect('/');
        if (!session.dashboardRecorded) {
            record(session.trace, 'dashboard.served', '10 · Dashboard delivered', 'The backend loaded your assigned store and returned its HTML page to your browser.');
            session.dashboardRecorded = true;
        }
        res.send(renderPage('dashboard', 'Your store', {
            name: user.name,
            storeId: user.store_id,
            email: user.email,
            userId: user.id,
            result: session.managedBy === 'SCIM' ? 'SCIM account preserved — SAML sign-in' : session.created ? 'Account created with JIT' : 'Existing account preserved',
            csrf: session.csrf
        }));
    });
    app.post('/logout', (req, res) => {
        const id = cookie(req, 'storeops_session') || '';
        const session = sessions.get(id);
        if (!session || req.body.csrf !== session.csrf)
            return res.sendStatus(403);
        sessions.delete(id);
        record(session.trace, 'session.ended', 'DemoMart session ended', 'The local session was removed. The separate Auth0 session may still be active.');
        res.clearCookie('storeops_session', { path: '/' });
        res.redirect('/');
    });
    app.use((err, _req, res, _next) => {
        const requestId = randomUUID();
        if (!_req.path.startsWith('/auth/saml/')) {
            record(null, 'request.failed', 'Request failed', 'A server or database request could not be completed.', 'error');
            return res.status(err.type === 'entity.parse.failed' ? 400 : 503).json({ errors: [{ message: 'Request could not be completed.', reference: requestId }] });
        }
        record(_req.loginTrace, 'login.rejected', 'Login stopped', err instanceof IdentityError ? err.message : 'SAML validation or request failure. Check the identity provider configuration.', 'error');
        // Never log raw assertions, credentials, or arbitrary library errors containing XML.
        console.error(JSON.stringify({ event: 'login.rejected', requestId, reason: err instanceof IdentityError ? err.message : 'SAML validation or request failure' }));
        res.status(400).send(renderPage('error', 'Sign-in unsuccessful', { requestId }));
    });
    return app;
}
