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
    const metrics = body.data.metrics;
    document.querySelector('#totalUsers').textContent = metrics.totalUsers;
    document.querySelector('#activeUsers').textContent = metrics.activeUsers;
    document.querySelector('#inactiveUsers').textContent = metrics.inactiveUsers;
    document.querySelector('#storeList').innerHTML = metrics.usersByStore
        .map(store => `<li>Store ${store.storeId}: ${store.users} user(s)</li>`).join('') || '<li>No users yet</li>';
    document.querySelector('#status').textContent = 'Loaded from SQLite through GraphQL.';
}

loadMetrics().catch(error => {
    document.querySelector('#status').textContent = error.message;
});
