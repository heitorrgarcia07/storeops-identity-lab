// Fixed seed and dates keep this interview dataset repeatable across runs.
export function demoSales() {
    let seed = 73191;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const start = Date.UTC(2026, 5, 14);
    const days = Array.from({length:90}, (_, index) => {
        const date = new Date(start + index * 86400000);
        const weekend = [0,6].includes(date.getUTCDay());
        return {date:date.toISOString().slice(0,10), weight:(1+index/90*.5)*(weekend?1.5:1)*(index>=42&&index<=46?.35:1)};
    });
    const weight = days.reduce((sum,day)=>sum+day.weight,0);
    return Array.from({length:1000},(_,i)=>{
        let pick = random()*weight;
        const day = days.find(day => (pick-=day.weight)<0) || days.at(-1);
        const store = i<620?'101':'102';
        const cents = Math.round((store==='101'?1800:4000)+random()*(store==='101'?11000:17000));
        return {sale_id:`demo-sales-v1-${String(i+1).padStart(4,'0')}`,sale_date:day.date,store_id:store,amount_usd:(cents/100).toFixed(2)};
    });
}

export async function seedSales(client, apply = false) {
    const rows = demoSales();
    await client.query('BEGIN');
    try {
        const lock = await client.query('SELECT pg_try_advisory_xact_lock(81473,1901) AS acquired');
        if (!lock.rows[0].acquired) throw new Error('A sync or seed is already running.');
        const before = (await client.query('SELECT COUNT(*)::int AS sales, pg_database_size(current_database())::text AS database_bytes FROM sales')).rows[0];
        const existing = (await client.query("SELECT COUNT(*)::int AS n FROM sales WHERE sale_id LIKE 'demo-sales-v1-%'")).rows[0].n;
        if (before.sales + 1000 - existing > 10000) throw new Error('Dataset would exceed the sync limit.');
        const owners = (await client.query("SELECT DISTINCT ON (store_id) id,store_id FROM users WHERE active=1 AND store_id IN ('101','102') ORDER BY store_id,id")).rows;
        if (owners.length!==2) throw new Error('An active account in each store is required to attribute synthetic sales.');
        const payload = rows.map(row=>({...row,created_by:owners.find(u=>u.store_id===row.store_id).id}));
        const records = 'jsonb_to_recordset($1::jsonb) AS x(sale_id text,sale_date date,store_id text,amount_usd numeric,created_by text)';
        const conflict = await client.query(`SELECT COUNT(*)::int AS n FROM ${records} JOIN sales s USING(sale_id) WHERE s.sale_date<>x.sale_date OR s.store_id<>x.store_id OR s.amount_usd<>x.amount_usd`,[JSON.stringify(payload)]);
        if (conflict.rows[0].n) throw new Error('Existing seed IDs contain different data. No changes made.');
        let inserted = 0;
        if (apply) {
            inserted = (await client.query(`INSERT INTO sales(sale_id,sale_date,store_id,amount_usd,created_by) SELECT sale_id,sale_date,store_id,amount_usd,created_by FROM ${records} ON CONFLICT(sale_id) DO NOTHING`,[JSON.stringify(payload)])).rowCount;
        }
        const summary = (await client.query('SELECT store_id,COUNT(*)::int AS sales,SUM(amount_usd)::text AS revenue_usd FROM sales GROUP BY store_id ORDER BY store_id')).rows;
        await client.query(apply?'COMMIT':'ROLLBACK');
        return {event:apply?'seed.completed':'seed.preview',batch:'demo-sales-v1',date_from:'2026-06-14',date_to:'2026-09-11',before,planned:1000,already_present:existing,inserted,stores:summary};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
}
