import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { IdentityError } from './identity.js';

// Separate PostgreSQL storage for the hosted app. All user values are parameters.
export class PostgresUsers {
    constructor(pool) {
        this.pool = pool;
        this.kind = 'PostgreSQL';
        this.scim = {
            find: async userName => (await pool.query('SELECT user_id FROM scim_resources WHERE lower(user_name)=lower($1)', [userName])).rows[0],
            get: async id => (await pool.query('SELECT resource FROM scim_resources WHERE user_id=$1', [id])).rows[0],
            list: async (userName, count, offset) => {
                const filter = userName ?? null;
                const total = (await pool.query('SELECT count(*)::int AS n FROM scim_resources WHERE ($1::text IS NULL OR lower(user_name)=lower($1))', [filter])).rows[0].n;
                const { rows } = await pool.query('SELECT resource FROM scim_resources WHERE ($1::text IS NULL OR lower(user_name)=lower($1)) ORDER BY user_id LIMIT $2 OFFSET $3', [filter, count, offset]);
                return { total, rows };
            },
            create: (resource, storeId) => this.transaction(async client => {
                await client.query('INSERT INTO users (id,issuer,subject,email,name,store_id,active) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                    [resource.id, 'urn:storeops:unlinked-scim', resource.id, resource.emails[0].value, resource.displayName, storeId, Number(resource.active)]);
                await client.query('INSERT INTO scim_resources (user_id,user_name,resource) VALUES ($1,$2,$3)',
                    [resource.id, resource.userName, JSON.stringify(resource)]);
            }),
            update: (id, resource, storeId, previous) => this.transaction(async client => {
                // Compare the previous value so simultaneous PATCH requests cannot silently overwrite each other.
                const saved = await client.query('UPDATE scim_resources SET resource=$1 WHERE user_id=$2 AND resource=$3', [JSON.stringify(resource), id, previous]);
                if (saved.rowCount !== 1) throw new Error('Concurrent update or missing resource');
                const updated = await client.query('UPDATE users SET store_id=$1,active=$2 WHERE id=$3', [storeId, Number(resource.active), id]);
                if (updated.rowCount !== 1) throw new Error('Missing account');
            })
        };
    }

    async initialize() {
        await this.pool.query(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL,
            email TEXT NOT NULL, name TEXT NOT NULL, store_id TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
            UNIQUE(issuer,subject)
        )`);
        await this.pool.query(`CREATE TABLE IF NOT EXISTS scim_resources (
            user_id TEXT PRIMARY KEY REFERENCES users(id),
            user_name TEXT NOT NULL, resource TEXT NOT NULL
        )`);
        await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS scim_user_name_unique ON scim_resources (lower(user_name))');
    }

    async transaction(work) {
        // Every statement in a transaction uses the same connection, including rollback.
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async get(id) {
        return (await this.pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
    }

    async isScimManaged(id) {
        return Boolean((await this.pool.query('SELECT user_id FROM scim_resources WHERE user_id=$1', [id])).rows[0]);
    }

    async metrics() {
        const { rows } = await this.pool.query('SELECT store_id AS "storeId", count(*)::int AS users, sum(active)::int AS active FROM users GROUP BY store_id ORDER BY store_id');
        const totalUsers = rows.reduce((sum, row) => sum + row.users, 0);
        const activeUsers = rows.reduce((sum, row) => sum + row.active, 0);
        return { totalUsers, activeUsers, inactiveUsers: totalUsers - activeUsers,
            usersByStore: rows.map(({ storeId, users }) => ({ storeId, users })) };
    }

    async linkIdentity(id, issuer, subject) {
        if (!issuer || !subject || issuer === 'urn:storeops:unlinked-scim') throw new IdentityError('A real IdP issuer and subject are required');
        return this.transaction(async client => {
            const user = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
            const managed = (await client.query('SELECT user_id FROM scim_resources WHERE user_id=$1', [id])).rows[0];
            if (!user || !managed) throw new IdentityError('Target must be an existing SCIM account');
            const other = (await client.query('SELECT id FROM users WHERE issuer=$1 AND subject=$2', [issuer, subject])).rows[0];
            if (other && other.id !== id) throw new IdentityError('This identity already belongs to another account; automatic merging is disabled');
            if (user.issuer !== 'urn:storeops:unlinked-scim' && (user.issuer !== issuer || user.subject !== subject)) {
                throw new IdentityError('This account already has a different identity; automatic relinking is disabled');
            }
            return (await client.query('UPDATE users SET issuer=$1,subject=$2 WHERE id=$3 RETURNING *', [issuer, subject, id])).rows[0];
        });
    }

    async login(profile, issuer, jit) {
        const field = key => {
            const value = profile[key];
            if (typeof value !== 'string' || !value.trim() || value.length > 300) throw new IdentityError(`Invalid or missing ${key}`);
            return value;
        };
        if (profile.issuer !== issuer) throw new IdentityError('Unexpected identity provider');
        const subject = field('nameID');
        return this.transaction(async client => {
            // Serialize logins for this identity, including concurrent first-time JIT logins.
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([issuer, subject])]);
            const existing = (await client.query('SELECT * FROM users WHERE issuer=$1 AND subject=$2 FOR UPDATE', [issuer, subject])).rows[0];
            if (existing && !existing.active) throw new IdentityError('Account inactive');
            if (existing && (await client.query('SELECT user_id FROM scim_resources WHERE user_id=$1', [existing.id])).rows[0]) {
                if (!['101', '102'].includes(existing.store_id)) throw new IdentityError('Store not authorized');
                return { user: existing, created: false, managedBy: 'SCIM' };
            }
            if (!existing && !jit) throw new IdentityError('JIT disabled; account must be provisioned');
            const email = field('email'), name = field('displayName'), store = field('storeId');
            if (!['101', '102'].includes(store)) throw new IdentityError('Store not authorized');
            if (existing) {
                const user = (await client.query('UPDATE users SET email=$1,name=$2,store_id=$3 WHERE id=$4 RETURNING *', [email, name, store, existing.id])).rows[0];
                return { user, created: false };
            }
            const user = (await client.query('INSERT INTO users (id,issuer,subject,email,name,store_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [randomUUID(), issuer, subject, email, name, store])).rows[0];
            return { user, created: true };
        });
    }

    close() { return this.pool.end(); }
}

export async function connectPostgres(connectionString) {
    const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000,
        statement_timeout: 15000, idle_in_transaction_session_timeout: 15000 });
    pool.on('error', () => console.error(JSON.stringify({ event: 'database.connection.error', detail: 'An idle PostgreSQL connection failed.' })));
    const users = new PostgresUsers(pool);
    try {
        await users.initialize();
        return users;
    } catch (error) {
        await pool.end();
        // Never print the connection string, password, or raw database error.
        throw new Error('PostgreSQL startup failed. Check DATABASE_URL and database availability.');
    }
}
