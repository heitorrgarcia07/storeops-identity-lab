const form = document.querySelector('#sale-form');
const date = document.querySelector('#sale-date');
const amount = document.querySelector('#sale-amount');
const button = document.querySelector('#save-sale');
const status = document.querySelector('#sale-status');
const summary = document.querySelector('#sales-summary');
const rows = document.querySelector('#sales-rows');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const today = new Date();
date.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
let pending;

async function loadSales() {
    const response = await fetch('/api/sales');
    if (!response.ok) throw new Error(response.status === 401 ? 'Your session ended. Sign in again.' : 'Could not load sales. Reload to retry.');
    const data = await response.json();
    rows.replaceChildren();
    let cents = 0;
    for (const sale of data.sales) {
        const row = document.createElement('tr');
        for (const value of [sale.sale_date, sale.sale_id, money.format(Number(sale.amount_usd))]) {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
        }
        rows.append(row);
        cents += Math.round(Number(sale.amount_usd) * 100);
    }
    summary.textContent = data.sales.length ? `${data.sales.length} sales shown · Total shown: ${money.format(cents / 100)}` : 'No sales yet. Record your first fictional sale above.';
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    // Preserve the same ID and payload when a network response is uncertain.
    pending ??= { sale_id: crypto.randomUUID(), sale_date: date.value, amount_usd: amount.value };
    date.disabled = amount.disabled = button.disabled = true;
    status.textContent = 'Saving sale…';
    try {
        const response = await fetch('/api/sales', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('#csrf').value },
            body: JSON.stringify(pending)
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status < 500) pending = undefined;
            throw new Error(data.error || 'Could not save sale.');
        }
        pending = undefined;
        amount.value = '';
        status.textContent = `Sale saved: ${data.sale_id}.`;
        try { await loadSales(); } catch (error) { summary.textContent = error.message; }
    } catch (error) {
        status.textContent = pending ? 'Confirmation unavailable. Click Retry sale to safely resend the same sale.' : error.message;
    } finally {
        button.disabled = false;
        date.disabled = amount.disabled = Boolean(pending);
        button.textContent = pending ? 'Retry sale' : 'Save sale';
    }
});
loadSales().catch(error => { summary.textContent = error.message; });
