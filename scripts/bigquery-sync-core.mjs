export const schema = 'sale_id:STRING,sale_date:DATE,store_id:STRING,amount_usd:NUMERIC';

export function summarize(rows) {
    if (!rows.length || rows.length > 10000) throw new Error('Expected 1–10000 sales. Destination was not changed.');
    const ids = new Set();
    let cents = 0n;
    for (const row of rows) {
        if (typeof row.sale_id !== 'string' || !row.sale_id || ids.has(row.sale_id) ||
            !['101','102'].includes(row.store_id) || !/^\d{4}-\d{2}-\d{2}$/.test(row.sale_date) ||
            !/^\d{1,7}\.\d{2}$/.test(row.amount_usd)) throw new Error('Invalid or duplicate source sale. Destination was not changed.');
        const value = BigInt(row.amount_usd.replace('.', ''));
        if (value <= 0n) throw new Error('Invalid source amount.');
        ids.add(row.sale_id);
        cents += value;
    }
    return { total_sales: String(rows.length), unique_sales: String(ids.size), revenue_cents: String(cents) };
}

export async function synchronize({ rows, project, dataset, location, apply, runBq, file, log }) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project || '') ||
        !/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/.test(dataset || '') || !/^[A-Za-z0-9-]+$/.test(location || '')) {
        throw new Error('Check BQ_PROJECT_ID, BQ_DATASET and BQ_LOCATION.');
    }
    const expected = summarize(rows);
    const target = `${project}:${dataset}.sales_usd`;
    log({ event:'sync.preview', target, ...expected });
    if (!apply) return expected;
    const common = [`--project_id=${project}`, `--location=${location}`, '--format=json'];
    await runBq([...common, 'load', '--replace=true', '--source_format=NEWLINE_DELIMITED_JSON', target, file, schema]);
    log({ event:'sync.loaded', target });
    const sql = `SELECT COUNT(*) AS total_sales, COUNT(DISTINCT sale_id) AS unique_sales,
        CAST(SUM(amount_usd)*100 AS INT64) AS revenue_cents FROM \`${project}.${dataset}.sales_usd\``;
    const actual = JSON.parse(await runBq([...common, 'query', '--use_legacy_sql=false', '--maximum_bytes_billed=100000000', sql]))[0];
    if (!actual || Object.keys(expected).some(key => String(actual[key]) !== expected[key])) {
        throw new Error('Load completed, but reconciliation failed. Inspect the destination before rerunning.');
    }
    log({ event:'sync.verified', target, ...expected });
    return expected;
}
