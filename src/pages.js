import { readFileSync } from 'node:fs';

// Values from users or configuration are escaped before entering HTML.
function escapeHtml(value) {
    const characters = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value).replace(/[&<>"']/g, character => characters[character]);
}

// Replace placeholders such as {{name}} in an HTML file.
export function renderPage(name, title, values = {}) {
    const template = readFileSync(new URL(`../views/${name}.html`, import.meta.url), 'utf8');
    const content = template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
        if (!(key in values)) throw new Error(`Missing page value: ${key}`);
        return escapeHtml(values[key]);
    });
    const layout = readFileSync(new URL('../views/layout.html', import.meta.url), 'utf8');
    // Only our rendered template is inserted as HTML; the title is escaped.
    return layout.replace(/\{\{(title|content)\}\}/g, (_match, key) => key === 'title' ? escapeHtml(title) : content);
}
