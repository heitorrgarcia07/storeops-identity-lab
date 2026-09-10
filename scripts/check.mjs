import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const folder of ['src', 'test']) {
    for (const file of readdirSync(folder).filter(file => file.endsWith('.js'))) {
        execFileSync(process.execPath, ['--check', `${folder}/${file}`], { stdio: 'inherit' });
    }
}
console.log('JavaScript syntax checks passed.');
