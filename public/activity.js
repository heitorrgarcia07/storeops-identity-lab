const timeline = document.querySelector('#timeline');
const status = document.querySelector('#activity-status');
const raw = document.querySelector('#raw-events');
let previous = '';

async function refresh() {
    try {
        const response = await fetch('/activity/data', { cache: 'no-store' });
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json();
        status.textContent = data.traceId ? 'Live · Showing your latest login in this browser' : 'No recorded login yet. Start a new sign-in in this browser. Earlier logins are not reconstructed.';
        const serialized = JSON.stringify(data.events);
        if (serialized !== previous) {
            previous = serialized;
            timeline.replaceChildren();
            for (const event of data.events) {
                const row = document.createElement('li');
                row.className = `event ${event.status}`;
                const time = document.createElement('time');
                time.textContent = new Date(event.time).toLocaleTimeString();
                const title = document.createElement('h2');
                title.textContent = event.title;
                const detail = document.createElement('p');
                detail.textContent = event.detail;
                row.append(time, title, detail);
                timeline.append(row);
            }
            raw.textContent = data.events.length ? data.events.map(event => JSON.stringify(event)).join('\n') : 'No events yet.';
        }
    } catch {
        status.textContent = 'Server unavailable. Start StoreOps to reconnect.';
    } finally {
        setTimeout(refresh, 1000);
    }
}
refresh();
