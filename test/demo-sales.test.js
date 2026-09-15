import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {demoSales,seedSales} from '../scripts/demo-sales.mjs';
test('synthetic batch preserves existing sales, previews without writes, repeats without duplicates and rejects changed seed IDs',async()=>{
    const db=new PGlite();
    const client={query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows};}};
    try {
        await db.exec("CREATE TABLE users(id text primary key,store_id text,active int); INSERT INTO users VALUES('a','101',1),('b','102',1); CREATE TABLE sales(sale_id text primary key,sale_date date,store_id text,amount_usd numeric(12,2),created_by text REFERENCES users(id)); INSERT INTO sales VALUES('manual','2026-09-11','101',25,'a');");
        assert.deepEqual(demoSales(),demoSales());
        assert.equal(new Set(demoSales().map(s=>s.sale_id)).size,1000);
        assert.equal((await seedSales(client)).inserted,0);
        assert.equal((await seedSales(client,true)).inserted,1000);
        assert.equal((await seedSales(client,true)).inserted,0);
        assert.equal((await db.query("SELECT amount_usd FROM sales WHERE sale_id='manual'")).rows[0].amount_usd,'25.00');
        await db.query("UPDATE sales SET amount_usd=1 WHERE sale_id='demo-sales-v1-0001'");
        await assert.rejects(seedSales(client,true),/different data/);
        assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM sales')).rows[0].n,1001);
    } finally {await db.close();}
});
