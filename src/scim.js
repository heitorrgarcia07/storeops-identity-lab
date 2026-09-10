import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { record } from './activity.js';
import { sqliteScim } from './sqlite-scim.js';

export const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const ENTERPRISE_SCHEMA = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

// Learning subset: create, read, and replace store/active fields. SAML linking comes later.
export function createScimRouter({ users, token, baseUrl }) {
    const router = express.Router();
    const store = users.scim || sqliteScim(users.db);

    function fail(res, status, detail, scimType) {
        record(null, 'scim.rejected', `SCIM request rejected (${status})`, detail, 'error');
        return res.status(status).json({ schemas: [ERROR_SCHEMA], status: String(status), detail, ...(scimType ? { scimType } : {}) });
    }

    router.use((req, res, next) => {
        res.type('application/scim+json');
        if (!token || token.length < 32) return fail(res, 503, 'SCIM is not configured.');
        const supplied = Buffer.from(req.get('authorization') || '');
        const expected = Buffer.from(`Bearer ${token}`);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            res.set('WWW-Authenticate', 'Bearer');
            return fail(res, 401, 'A valid provisioning token is required.');
        }
        next();
    });
    router.use(express.json({ type: ['application/scim+json', 'application/json'], limit: '32kb' }));

    router.post('/Users', async (req, res) => {
        record(null, 'scim.create.received', 'SCIM create request received', 'POST /scim/v2/Users was authenticated. No SAML login is involved.');
        const body = req.body;
        const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
        if (!body || !Array.isArray(body.schemas) || !body.schemas.includes(USER_SCHEMA)) {
            return fail(res, 400, 'The core User schema is required.', 'invalidValue');
        }
        if (!text(body.userName) || !text(body.displayName) ||
            !Array.isArray(body.emails) || body.emails.length !== 1 || !text(body.emails[0]?.value) ||
            (body.active !== undefined && typeof body.active !== 'boolean') ||
            (body.externalId !== undefined && !text(body.externalId))) {
            return fail(res, 400, 'This lab requires userName, displayName, one email and a boolean active value if supplied.', 'invalidValue');
        }
        const storeId = body[ENTERPRISE_SCHEMA]?.department;
        if (!body.schemas.includes(ENTERPRISE_SCHEMA) || !['101', '102'].includes(storeId)) {
            return fail(res, 400, 'Map enterprise department to store 101 or 102 for this lab.', 'invalidValue');
        }
        const userName = body.userName.trim();
        if (await store.find(userName)) {
            return fail(res, 409, 'A SCIM account with this userName already exists.', 'uniqueness');
        }
        const id = randomUUID();
        const now = new Date().toISOString();
        const location = `${baseUrl}/scim/v2/Users/${id}`;
        const resource = {
            schemas: [USER_SCHEMA, ENTERPRISE_SCHEMA], id,
            ...(body.externalId !== undefined ? { externalId: body.externalId } : {}),
            userName, displayName: body.displayName, active: body.active ?? true,
            emails: [{ value: body.emails[0].value, type: 'work', primary: true }],
            [ENTERPRISE_SCHEMA]: { department: storeId },
            meta: { resourceType: 'User', created: now, lastModified: now, location }
        };
        try {
            await store.create(resource, storeId);
        } catch (error) {
            if (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return fail(res, 409, 'A SCIM account with this userName already exists.', 'uniqueness');
            }
            return fail(res, 500, 'The account could not be saved.');
        }
        record(null, 'scim.user.created', 'Account provisioned before login', 'A user was saved in the database by SCIM. No Auth0 user or browser session was created.');
        res.location(location).status(201).json(resource);
    });

    router.patch('/Users/:id', async (req, res) => {
        record(null, 'scim.patch.received', 'SCIM update request received', 'An authenticated PATCH request is being checked before any changes are saved.');
        const body = req.body;
        const patchSchema = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
        if (!body || !Array.isArray(body.schemas) || body.schemas.length !== 1 || body.schemas[0] !== patchSchema ||
            !Array.isArray(body.Operations) || body.Operations.length === 0 || body.Operations.length > 20) {
            return fail(res, 400, 'Provide the PatchOp schema and 1 to 20 Operations.', 'invalidSyntax');
        }
        const row = await store.get(req.params.id);
        if (!row) return fail(res, 404, 'SCIM user not found.');
        const resource = JSON.parse(row.resource);
        // Work on a copy; reject the whole request if any operation is invalid.
        for (const operation of body.Operations) {
            if (!operation || typeof operation.op !== 'string' || operation.op.toLowerCase() !== 'replace') {
                return fail(res, 400, 'This lab supports replace operations only.', 'invalidSyntax');
            }
            const path = typeof operation.path === 'string' ? operation.path.toLowerCase() : '';
            if (path === 'active') {
                if (typeof operation.value !== 'boolean') return fail(res, 400, 'active must be true or false, without quotes.', 'invalidValue');
                resource.active = operation.value;
            } else if (path === `${ENTERPRISE_SCHEMA}:department`.toLowerCase()) {
                if (!['101', '102'].includes(operation.value)) return fail(res, 400, 'Store must be the string 101 or 102.', 'invalidValue');
                resource[ENTERPRISE_SCHEMA].department = operation.value;
            } else {
                return fail(res, 400, 'Supported paths: active and the enterprise department attribute.', 'invalidPath');
            }
        }
        if (JSON.stringify(resource) === row.resource) {
            record(null, 'scim.user.unchanged', 'Account already has these values', 'No database update was necessary.');
            return res.status(200).json(resource);
        }
        resource.meta.lastModified = new Date(Math.max(Date.now(), Date.parse(resource.meta.lastModified) + 1)).toISOString();
        try {
            await store.update(req.params.id, resource, resource[ENTERPRISE_SCHEMA].department, row.resource);
        } catch {
            return fail(res, 500, 'The account could not be updated. No changes were saved.');
        }
        record(null, 'scim.user.updated', 'Provisioned account updated', 'The local account and SCIM representation were updated together. The account ID was preserved.');
        res.status(200).json(resource);
    });

    router.get('/Users', async (req, res) => {
        // A deliberately small filter subset, sufficient for checking this exercise.
        const filter = req.query.filter;
        const match = typeof filter === 'string' ? /^userName eq "([^"\\]+)"$/.exec(filter) : null;
        if (filter !== undefined && !match) return fail(res, 400, 'Only userName eq "value" filtering is supported in this exercise.', 'invalidFilter');
        const startIndex = Number(req.query.startIndex ?? 1);
        const count = Number(req.query.count ?? 100);
        if (!Number.isSafeInteger(startIndex) || startIndex < 1 || !Number.isSafeInteger(count) || count < 0 || count > 100) {
            return fail(res, 400, 'Use startIndex >= 1 and count from 0 to 100.', 'invalidValue');
        }
        const { total, rows } = await store.list(match?.[1], count, startIndex - 1);
        res.json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: total, startIndex, itemsPerPage: rows.length, Resources: rows.map(row => JSON.parse(row.resource)) });
    });
    router.get('/Users/:id', async (req, res) => {
        const row = await store.get(req.params.id);
        if (!row) return fail(res, 404, 'SCIM user not found.');
        record(null, 'scim.user.read', 'Provisioned account retrieved', 'GET /scim/v2/Users/:id returned the account stored in the database.');
        res.json(JSON.parse(row.resource));
    });
    router.use((_req, res) => fail(res, 501, 'This exercise supports creating, reading, and PATCH replace of store and active only.'));
    router.use((error, _req, res, _next) => {
        if (error.type === 'entity.too.large') return fail(res, 413, 'Request body is too large.');
        if (error.type === 'entity.parse.failed') return fail(res, 400, 'Invalid JSON request body.');
        return fail(res, 503, 'The database request could not be completed.');
    });
    return router;
}
