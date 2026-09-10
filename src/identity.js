import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
export class IdentityError extends Error {
}
export class Users {
    db;
    constructor(path) {
        this.db = new DatabaseSync(path);
        this.db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL,
      email TEXT NOT NULL, name TEXT NOT NULL, store_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, UNIQUE(issuer, subject)
    )`);
    }
    get(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
    metrics() {
        const total = this.db.prepare('SELECT COUNT(*) AS value FROM users').get().value;
        const active = this.db.prepare('SELECT COUNT(*) AS value FROM users WHERE active=1').get().value;
        const byStore = this.db.prepare('SELECT store_id AS storeId, COUNT(*) AS users FROM users GROUP BY store_id ORDER BY store_id').all();
        return { totalUsers: total, activeUsers: active, inactiveUsers: total - active, usersByStore: byStore };
    }
    isScimManaged(id) {
        const table = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scim_resources'").get();
        return Boolean(table && this.db.prepare('SELECT user_id FROM scim_resources WHERE user_id=?').get(id));
    }
    linkIdentity(id, issuer, subject) {
        if (!issuer || !subject || issuer === 'urn:storeops:unlinked-scim') throw new IdentityError('A real IdP issuer and subject are required');
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const user = this.get(id);
            if (!user || !this.isScimManaged(id)) throw new IdentityError('Target must be an existing SCIM account');
            const other = this.db.prepare('SELECT id FROM users WHERE issuer=? AND subject=?').get(issuer, subject);
            if (other && other.id !== id) throw new IdentityError('This identity already belongs to another account; automatic merging is disabled');
            if (user.issuer !== 'urn:storeops:unlinked-scim' && (user.issuer !== issuer || user.subject !== subject)) {
                throw new IdentityError('This account already has a different identity; automatic relinking is disabled');
            }
            this.db.prepare('UPDATE users SET issuer=?,subject=? WHERE id=?').run(issuer, subject, id);
            this.db.exec('COMMIT');
            return this.get(id);
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    login(profile, issuer, jit) {
        const field = (key) => {
            const value = profile[key];
            if (typeof value !== 'string' || !value.trim() || value.length > 300)
                throw new IdentityError(`Invalid or missing ${key}`);
            return value;
        };
        if (profile.issuer !== issuer)
            throw new IdentityError('Unexpected identity provider');
        const subject = field('nameID');
        const existing = this.db.prepare('SELECT * FROM users WHERE issuer=? AND subject=?').get(issuer, subject);
        if (existing && !existing.active)
            throw new IdentityError('Account inactive');
        if (existing && this.isScimManaged(existing.id)) {
            if (!['101', '102'].includes(existing.store_id)) throw new IdentityError('Store not authorized');
            // SAML authenticates this identity. Provisioning owns its profile and access state.
            return { user: existing, created: false, managedBy: 'SCIM' };
        }
        if (!existing && !jit)
            throw new IdentityError('JIT disabled; account must be provisioned');
        const email = field('email');
        const name = field('displayName');
        const store = field('storeId');
        if (!['101', '102'].includes(store))
            throw new IdentityError('Store not authorized');
        if (existing) {
            this.db.prepare('UPDATE users SET email=?,name=?,store_id=? WHERE id=?').run(email, name, store, existing.id);
            return { user: this.get(existing.id), created: false };
        }
        const id = randomUUID();
        this.db.prepare('INSERT INTO users (id,issuer,subject,email,name,store_id) VALUES (?,?,?,?,?,?)').run(id, issuer, subject, email, name, store);
        return { user: this.get(id), created: true };
    }
}
