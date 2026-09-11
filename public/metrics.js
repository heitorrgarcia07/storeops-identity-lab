const query = `query MetricsWidget {
  metrics {
    totalUsers
    activeUsers
    inactiveUsers
    usersByStore { storeId users }
  }
}`;

async function loadMetrics() {
    const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    if (!response.ok) throw new Error(`GraphQL request failed (${response.status})`);
    const body = await response.json();
    if (body.errors?.length || !body.data?.metrics) throw new Error('Metrics are unavailable. Please try again.');
    const metrics = body.data.metrics;
    document.querySelector('#totalUsers').textContent = metrics.totalUsers;
    document.querySelector('#activeUsers').textContent = metrics.activeUsers;
    document.querySelector('#inactiveUsers').textContent = metrics.inactiveUsers;
    const stores = metrics.usersByStore.map(store => {
        const item = document.createElement('li');
        item.textContent = `Store ${store.storeId}: ${store.users} user(s)`;
        return item;
    });
    if (!stores.length) {
        const empty = document.createElement('li');
        empty.textContent = 'No users yet';
        stores.push(empty);
    }
    document.querySelector('#storeList').replaceChildren(...stores);
    document.querySelector('#status').textContent = 'Loaded from the database through the metrics API.';
}

loadMetrics().catch(error => {
    document.querySelector('#status').textContent = error.message;
});
