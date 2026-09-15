import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bigQueryError } from '../scripts/bigquery-errors.mjs';
test('CLI diagnostics distinguish missing executable, timeout, auth, schema and flags without exposing output', () => {
    assert.match(bigQueryError({code:'ENOENT'}), /PATH/);
    assert.match(bigQueryError({killed:true}), /may still be running/);
    assert.match(bigQueryError({stderr:'invalid_grant secret-token'}), /login/);
    assert.match(bigQueryError({stdout:'Access Denied secret-token'}), /denied access/);
    assert.match(bigQueryError({stdout:'Unknown flag secret-token'}), /argument/);
    assert.match(bigQueryError({stdout:'schema mismatch secret-token'}), /schema/);
    assert.doesNotMatch(bigQueryError({stderr:'secret-token unknown failure'}), /secret-token/);
});
