import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, synchronize } from '../scripts/bigquery-sync-core.mjs';
const rows = [ { sale_id:'a', sale_date:'2026-09-11', store_id:'101', amount_usd:'0.10' },
    { sale_id:'b', sale_date:'2026-09-11', store_id:'102', amount_usd:'0.20' } ];
const options = { rows, project:'demomart-test', dataset:'demomart_analytics', location:'US', file:'/tmp/sales.ndjson', log() {} };
test('snapshot uses exact cents and rejects empty, oversized and duplicate sources', () => {
    assert.equal(summarize(rows).revenue_cents,'30');
    for (const bad of [[], [rows[0],rows[0]], Array(10001).fill(rows[0]), [{...rows[0],amount_usd:'-1.00'}]]) assert.throws(() => summarize(bad));
});
test('preview makes no BigQuery requests', async () => {
    await synchronize({...options, apply:false, runBq() { assert.fail('Unexpected write'); }});
});
test('repeat loads replace instead of append and reconcile the source snapshot', async () => {
    const calls = [];
    const runBq = async args => { calls.push(args); return args.includes('query') ? JSON.stringify([summarize(rows)]) : ''; };
    await synchronize({...options,apply:true,runBq});
    await synchronize({...options,apply:true,runBq});
    assert.equal(calls.filter(args => args.includes('--replace=true')).length,2);
    assert.ok(calls[0].includes('demomart-test:demomart_analytics.sales_usd'));
});
test('failed upload never reports reconciliation success; mismatch fails after load', async () => {
    let calls = 0;
    await assert.rejects(synchronize({...options,apply:true,runBq:async () => {calls++; throw new Error('upload failed');}}), /upload failed/);
    assert.equal(calls,1);
    await assert.rejects(synchronize({...options,apply:true,runBq:async args => args.includes('query') ? '[{"total_sales":"999"}]' : ''}), /reconciliation failed/);
    await assert.rejects(synchronize({...options,project:'bad`project',apply:true}), /Check BQ/);
});
