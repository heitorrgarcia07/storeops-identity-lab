import { config } from 'dotenv';
import { Pool } from 'pg';
import { seedSales } from './demo-sales.mjs';
config({path:new URL('../.env.bigquery',import.meta.url).pathname,quiet:true});
const pool = new Pool({connectionString:process.env.SYNC_DATABASE_URL,max:1,connectionTimeoutMillis:10000,statement_timeout:20000});
let client;
try {
    if(!process.env.SYNC_DATABASE_URL || process.argv.slice(2).some(arg=>arg!=='--apply')) throw new Error('Invalid configuration or arguments.');
    client = await pool.connect();
    console.log(JSON.stringify(await seedSales(client,process.argv.includes('--apply'))));
} catch(error) {
    console.error(JSON.stringify({event:'seed.failed',detail:error.code?'Database operation failed; verify connection and schema.':error.message}));
    process.exitCode=1;
} finally { client?.release(true); await pool.end(); }
