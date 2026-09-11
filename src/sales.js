import express from 'express';
import { SalesConflict } from './sales-store.js';
import { renderPage } from './pages.js';
import { record } from './activity.js';

export function createSalesRouter({ sales, getAccess }) {
    const router = express.Router();
    // Look up the current account on every request: SCIM changes take effect immediately.
    router.use(async (req, res, next) => {
        const access = await getAccess(req);
        if (!access?.session || !access.user?.active || !['101', '102'].includes(access.user.store_id)) {
            return req.path === '/sales' ? res.redirect('/') : res.status(401).json({ error: 'Sign in with an active store account.' });
        }
        req.salesAccess = access;
        next();
    });
    router.get('/sales', (req, res) => res.send(renderPage('sales', 'Sales', {
        storeId: req.salesAccess.user.store_id, csrf: req.salesAccess.session.csrf
    })));
    router.get('/api/sales', async (req, res) => {
        if (Object.keys(req.query).length) return res.status(400).json({ error: 'Store selection is determined by your account.' });
        const storeId = req.salesAccess.user.store_id;
        res.json({ store_id: storeId, sales: await sales.list(storeId), limit: 100 });
    });
    router.post('/api/sales', async (req, res) => {
        const { user, session } = req.salesAccess;
        if (req.get('x-csrf-token') !== session.csrf) return res.status(403).json({ error: 'Invalid form token. Reload the page.' });
        const body = req.body || {};
        const { sale_id, sale_date, amount_usd } = body;
        if (Object.keys(body).some(key => !['sale_id', 'sale_date', 'amount_usd'].includes(key)) ||
            typeof sale_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sale_id) ||
            typeof sale_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sale_date) ||
            !Number.isFinite(Date.parse(sale_date)) || new Date(sale_date).toISOString().slice(0,10) !== sale_date ||
            typeof amount_usd !== 'string' || !/^\d{1,7}(\.\d{1,2})?$/.test(amount_usd)) {
            return res.status(400).json({ error: 'Provide a valid sale ID, date and positive amount with at most two decimals.' });
        }
        const [whole, fraction = ''] = amount_usd.split('.');
        const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        if (cents < 1 || cents > 999999999) return res.status(400).json({ error: 'Amount must be between 0.01 and 9999999.99 USD.' });
        const saved = await sales.create({ sale_id, sale_date, amount_usd: (cents / 100).toFixed(2),
            amount_cents: cents, store_id: user.store_id, created_by: user.id });
        record(null, saved.created ? 'sale.created' : 'sale.repeated', 'Sale recorded', 'A sale was saved or recognized as an identical retry for the assigned store.');
        res.status(saved.created ? 201 : 200).json(saved.sale);
    });
    router.use((error, _req, res, _next) => {
        record(null, 'sale.failed', 'Sales request failed', 'A sales request could not be completed.', 'error');
        res.status(error instanceof SalesConflict ? 409 : 503).json({ error: error instanceof SalesConflict ? 'Sale ID already used with different data.' : 'Sales are temporarily unavailable. Please retry.' });
    });
    return router;
}
