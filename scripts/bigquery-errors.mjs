// Inspect CLI output internally; never expose raw output, credentials or sale rows.
export function bigQueryError(error) {
    if (error.code === 'ENOENT') return 'bq was not found in this terminal PATH. Run bq version in the same terminal.';
    if (error.killed || error.code === 'ETIMEDOUT') return 'BigQuery command timed out. Check BigQuery Job history before retrying; the job may still be running.';
    const output = `${error.stdout || ''}\n${error.stderr || ''}`;
    if (/unrecognized|unknown flag|unknown command|error parsing.*flag/i.test(output)) return 'bq rejected a command argument. Check the installed bq version and command flags.';
    if (/reauth|invalid_grant|login required|not.*logged in|no active account|credentials.*not found/i.test(output)) return 'Google login is missing or expired. Run gcloud auth login in this terminal.';
    if (/access denied|permission denied|does not have.*permission|403/i.test(output)) return 'Google denied access. Check the active account, project ID and BigQuery job/dataset permissions.';
    if (/not found|404/i.test(output)) return 'BigQuery project, dataset or table was not found. Check the project ID, dataset and location.';
    if (/billing|quota|sandbox/i.test(output)) return 'BigQuery reported a billing, sandbox or quota restriction. Inspect the failed job details; do not enable billing automatically.';
    if (/schema|invalid.*json|parsing.*json/i.test(output)) return 'BigQuery rejected the data or schema. Inspect the failed load job details.';
    if (/python|module.*not found/i.test(output)) return 'The Google Cloud CLI runtime failed. Check bq version in this terminal.';
    return 'BigQuery CLI failed. Run bq version and inspect BigQuery Job history for the original error.';
}
