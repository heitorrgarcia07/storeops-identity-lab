export class SalesConflict extends Error {}

function result(row, input, created) {
    if (!row || row.store_id !== input.store_id || row.created_by !== input.created_by ||
        row.sale_date !== input.sale_date || row.amount_usd !== input.amount_usd) {
        throw new SalesConflict('Sale ID already used.');
    }
    const { created_by, ...sale } = row;
    return { sale, created };
}

export function sqliteSales(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS sales (
        sale_id TEXT PRIMARY KEY, sale_date TEXT NOT NULL,
        store_id TEXT NOT NULL CHECK(store_id IN ('101','102')),
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0 AND amount_cents <= 999999999),
        created_by TEXT NOT NULL REFERENCES users(id)
    )`);
    const row = value => value && ({ sale_id: value.sale_id, sale_date: value.sale_date,
        store_id: value.store_id, amount_usd: (value.amount_cents / 100).toFixed(2), created_by: value.created_by });
    return {
        list(storeId) {
            return db.prepare('SELECT * FROM sales WHERE store_id=? ORDER BY sale_date DESC,sale_id LIMIT 100').all(storeId)
                .map(value => { const { created_by, ...sale } = row(value); return sale; });
        },
        create(input) {
            const saved = db.prepare('INSERT INTO sales (sale_id,sale_date,store_id,amount_cents,created_by) VALUES (?,?,?,?,?) ON CONFLICT(sale_id) DO NOTHING')
                .run(input.sale_id, input.sale_date, input.store_id, input.amount_cents, input.created_by);
            return result(row(db.prepare('SELECT * FROM sales WHERE sale_id=?').get(input.sale_id)), input, saved.changes === 1);
        }
    };
}

export function postgresSales(pool) {
    const fields = 'sale_id,sale_date::text AS sale_date,store_id,amount_usd::text AS amount_usd';
    return {
        async initialize() {
            // Earlier lab versions labeled these fictional amounts BRL.
            // Rename in place, preserving IDs and values; this is not FX conversion.
            await pool.query(`DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema=current_schema() AND table_name='sales' AND column_name='amount_brl') THEN
                    ALTER TABLE sales RENAME COLUMN amount_brl TO amount_usd;
                END IF;
            END $$`);
            await pool.query(`CREATE TABLE IF NOT EXISTS sales (
                sale_id TEXT PRIMARY KEY, sale_date DATE NOT NULL,
                store_id TEXT NOT NULL CHECK(store_id IN ('101','102')),
                amount_usd NUMERIC(12,2) NOT NULL CHECK(amount_usd > 0 AND amount_usd <= 9999999.99),
                created_by TEXT NOT NULL REFERENCES users(id)
            )`);
            await pool.query('CREATE INDEX IF NOT EXISTS sales_store_date ON sales(store_id,sale_date DESC)');
        },
        async list(storeId) {
            return (await pool.query(`SELECT ${fields} FROM sales WHERE store_id=$1 ORDER BY sale_date DESC,sale_id LIMIT 100`, [storeId])).rows;
        },
        async create(input) {
            const inserted = await pool.query(`INSERT INTO sales (sale_id,sale_date,store_id,amount_usd,created_by)
                VALUES ($1,$2,$3,$4,$5) ON CONFLICT(sale_id) DO NOTHING RETURNING ${fields},created_by`,
                [input.sale_id, input.sale_date, input.store_id, input.amount_usd, input.created_by]);
            const row = inserted.rows[0] || (await pool.query(`SELECT ${fields},created_by FROM sales WHERE sale_id=$1`, [input.sale_id])).rows[0];
            return result(row, input, inserted.rowCount === 1);
        }
    };
}
