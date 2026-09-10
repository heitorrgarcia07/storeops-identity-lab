// SCIM persistence for the local SQLite lab. PostgreSQL implements the same methods.
export function sqliteScim(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS scim_resources (
        user_id TEXT PRIMARY KEY,
        user_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        resource TEXT NOT NULL
    )`);
    return {
        find(userName) {
            return db.prepare('SELECT user_id FROM scim_resources WHERE user_name=?').get(userName);
        },
        get(id) {
            return db.prepare('SELECT resource FROM scim_resources WHERE user_id=?').get(id);
        },
        list(userName, count, offset) {
            const clause = userName ? ' WHERE user_name=?' : '';
            const params = userName ? [userName] : [];
            const total = db.prepare(`SELECT count(*) AS n FROM scim_resources${clause}`).get(...params).n;
            const rows = db.prepare(`SELECT resource FROM scim_resources${clause} ORDER BY user_id LIMIT ? OFFSET ?`).all(...params, count, offset);
            return { total, rows };
        },
        create(resource, storeId) {
            db.exec('BEGIN');
            try {
                db.prepare('INSERT INTO users (id,issuer,subject,email,name,store_id,active) VALUES (?,?,?,?,?,?,?)')
                    .run(resource.id, 'urn:storeops:unlinked-scim', resource.id, resource.emails[0].value, resource.displayName, storeId, Number(resource.active));
                db.prepare('INSERT INTO scim_resources (user_id,user_name,resource) VALUES (?,?,?)')
                    .run(resource.id, resource.userName, JSON.stringify(resource));
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        },
        update(id, resource, storeId, previous) {
            db.exec('BEGIN');
            try {
                const saved = db.prepare('UPDATE scim_resources SET resource=? WHERE user_id=? AND resource=?')
                    .run(JSON.stringify(resource), id, previous);
                if (saved.changes !== 1) throw new Error('Concurrent update or missing resource');
                const update = db.prepare('UPDATE users SET store_id=?,active=? WHERE id=?')
                    .run(storeId, Number(resource.active), id);
                if (update.changes !== 1) throw new Error('Missing local account');
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        }
    };
}
