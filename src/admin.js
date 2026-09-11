import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { IdentityError } from './identity.js';
import { record } from './activity.js';

// Custom administrative API, not a SCIM operation. The trusted issuer is server-owned.
export function createAdminRouter({ users, token, scimToken, issuer }) {
    const router = express.Router();
    const fail = (res, status, message) => {
        record(null, 'identity.link.rejected', 'Identity link rejected', `Administrative request rejected (${status}).`, 'error');
        return res.status(status).json({ error: message });
    };
    router.use((req, res, next) => {
        if (!token || token.length < 32 || token === scimToken || !issuer || issuer === 'urn:storeops:unlinked-scim') {
            return fail(res, 503, 'Configure a separate ADMIN_TOKEN and IDP_ISSUER.');
        }
        const supplied = Buffer.from(req.get('authorization') || '');
        const expected = Buffer.from(`Bearer ${token}`);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            res.set('WWW-Authenticate', 'Bearer');
            return fail(res, 401, 'An administrative token is required.');
        }
        next();
    });
    router.use(express.json({ limit: '8kb' }));
    router.post('/identity-links', async (req, res) => {
        const { userId, subject } = req.body || {};
        if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId) ||
            typeof subject !== 'string' || !/^auth0\|[^\s|]+$/.test(subject) || subject.length > 300 ||
            Object.keys(req.body).some(key => !['userId', 'subject'].includes(key))) {
            return fail(res, 400, 'Provide only userId (SCIM account ID) and subject (Auth0 user ID).');
        }
        try {
            if (!await users.get(userId)) return fail(res, 404, 'Account not found.');
            const user = await users.linkIdentity(userId, issuer, subject);
            record(null, 'identity.linked', 'Identity linked', 'An administrator linked an Auth0 identity to a SCIM account. Account ID and provisioning data were preserved.');
            res.json({ userId: user.id, issuer: user.issuer, subject: user.subject, status: 'linked' });
        } catch (error) {
            if (error instanceof IdentityError) return fail(res, 409, error.message);
            if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') return fail(res, 409, 'This identity already belongs to another account.');
            return fail(res, 503, 'The identity link could not be saved.');
        }
    });
    router.use((error, _req, res, _next) => fail(res, error.type === 'entity.too.large' ? 413 : 400, 'Invalid request body.'));
    return router;
}
