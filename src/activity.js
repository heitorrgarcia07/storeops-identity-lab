import { randomUUID } from 'node:crypto';

// Each login has its own timeline. Only fixed descriptions enter the logs.
export function createTrace() {
    return { id: randomUUID(), expires: Date.now() + 3_600_000, events: [] };
}

export function record(trace, event, title, detail, status = 'success') {
    const entry = { time: new Date().toISOString(), event, title, detail, status };
    if (trace && trace.events.length < 80) trace.events.push(entry);
    console.info(JSON.stringify({ trace: trace?.id, ...entry }));
}
