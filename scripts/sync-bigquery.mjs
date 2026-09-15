import { config } from 'dotenv';
import { Pool } from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarize, synchronize } from './bigquery-sync-core.mjs';
import { bigQueryError } from './bigquery-errors.mjs';

config({ path: new URL('../.env.bigquery', import.meta.url).pathname, quiet:true });
const log = entry => console.log(JSON.stringify(entry));
const execute = promisify(execFile);
let pool, client, directory;
let stage = 'configuration';
try {
    if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Use npm run sync:bigquery [-- --apply].');
    if (!process.env.SYNC_DATABASE_URL) throw new Error('Set SYNC_DATABASE_URL in .env.bigquery.');
    stage = 'postgres';
    // Dedicated connection: no application startup migrations, only SELECT queries.
    pool = new Pool({ connectionString:process.env.SYNC_DATABASE_URL, max:1, connectionTimeoutMillis:10000, statement_timeout:15000 });
    pool.on('error', () => log({ event:'sync.connection.error' }));
    client = await pool.connect();
    // Serialize runs of this script for this source database.
    const lock = await client.query('SELECT pg_try_advisory_lock(81473, 1901) AS acquired');
    if (!lock.rows[0].acquired) throw Object.assign(new Error('Another synchronization is running.'), { code:'SYNC_LOCKED' });
    const { rows } = await client.query('SELECT sale_id,sale_date::text AS sale_date,store_id,amount_usd::text AS amount_usd FROM sales ORDER BY sale_id LIMIT 10001');
    stage = 'validation';
    summarize(rows);
    directory = await mkdtemp(join(tmpdir(), 'demomart-bq-'));
    const file = join(directory, 'sales.ndjson');
    await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n')+'\n', { mode:0o600 });
    await synchronize({ rows, file, project:process.env.BQ_PROJECT_ID, dataset:process.env.BQ_DATASET || 'demomart_analytics',
        location:process.env.BQ_LOCATION || 'US', apply:process.argv.includes('--apply'), log,
        runBq:async args => {
            stage = args.includes('load') ? 'bigquery.load' : 'bigquery.reconcile';
            try { return (await execute('bq', args, { timeout:300000, maxBuffer:1024*1024 })).stdout; }
            catch (error) { throw new Error(bigQueryError(error)); }
        }
    });
    if (!process.argv.includes('--apply')) console.log('Preview only. To replace the destination snapshot: node scripts/sync-bigquery.mjs --apply');
} catch (error) {
    // Database errors may contain connection details, so do not print them.
    const databaseErrors = {
        ENOTFOUND:'Database hostname was not found. Use the external Render URL.',
        ECONNREFUSED:'Database connection was refused. Check host, port and database availability.',
        ETIMEDOUT:'Database connection timed out. Check network access and Render access rules.',
        '28P01':'Database authentication failed. Check the username and password locally.',
        '28000':'Database access rejected. Check TLS settings and Render access rules.',
        '3D000':'Database name does not exist. Check the external connection URL.',
        '42P01':'Sales table not found. Check the selected database and deployment.',
        '42703':'Expected sales column not found. Check the USD migration.',
        '42501':'Database account lacks permission to read sales.',
        SYNC_LOCKED:'Another synchronization is running.',
        CERT_HAS_EXPIRED:'TLS certificate expired. Check the server certificate.',
        UNABLE_TO_VERIFY_LEAF_SIGNATURE:'TLS certificate could not be verified. Check the trusted certificate chain.',
        SELF_SIGNED_CERT_IN_CHAIN:'TLS certificate chain is not trusted. Configure the correct CA.'
    };
    log({ event:'sync.failed', stage, detail:stage === 'postgres' ? (databaseErrors[error.code] || 'Could not connect to or read the source. Check TLS, connection and database availability.') : error.message });
    process.exitCode = 1;
} finally {
    // Destroy the session so its advisory lock is released even after failure.
    client?.release(true);
    if (pool) await pool.end();
    if (directory) await rm(directory, { recursive:true, force:true });
}
