import {mkdir, open, rename, rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dirname} from 'node:path';
import type MigrateContext from './MigrateContext.js';

/** Stream diagnostic rows without materializing migration history. */
export async function writeMigrationReport(
    context: MigrateContext,
    path: string,
    summary: Record<string, unknown>
): Promise<void> {
    const encodedSummary = JSON.stringify(summary);
    if (typeof encodedSummary !== 'string' || !encodedSummary.startsWith('{')) {
        throw new TypeError('Report summary must serialize to a JSON object.');
    }
    await mkdir(dirname(path), {recursive: true});
    const temporary = `${path}.${randomUUID()}.tmp`;
    const output = await open(temporary, 'w');
    let succeeded = false;
    try {
        await output.writeFile(
            `{"summary":${encodedSummary.slice(0, -1)}${encodedSummary.length > 2 ? ',' : ''}"diagnostics":{`
        );
        let separator = '';
        for (const row of context.db.db
            .prepare('SELECT type, COUNT(*) AS count FROM MigrationEvents GROUP BY type ORDER BY type')
            .iterate() as Iterable<{type: string; count: number}>) {
            await output.writeFile(separator + JSON.stringify(row.type) + ':' + row.count);
            separator = ',';
        }
        await output.writeFile('}},"events":[');
        separator = '';
        for await (const event of context.streamDiagnostics()) {
            await output.writeFile(separator + JSON.stringify(event));
            separator = ',';
        }
        await output.writeFile(']}\n');
        await output.close();
        await rename(temporary, path);
        succeeded = true;
    } finally {
        await output.close();
        if (!succeeded) {
            await rm(temporary, {force: true});
        }
    }
}
