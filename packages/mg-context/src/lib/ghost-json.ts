import {mkdir, open, rename, rm, stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import type MigrateContext from './MigrateContext.js';
import {buildPostWhere, type WrittenFile, type WriteGhostJsonOptions} from './MigrateContext.js';
import PostContext from './PostContext.js';
import {findByIds, findByColumn} from './db-helpers.js';
import {exportBaseFilename} from './export-filename.js';

// Limit SQL bind parameters independently of the configured output chunk size.
function queryBatches<T>(ids: number[], query: (part: number[]) => T[]): T[] {
    if (ids.length <= 1000) {
        return query(ids);
    }
    const rows: T[] = [];
    for (let offset = 0; offset < ids.length; offset += 1000) {
        for (const row of query(ids.slice(offset, offset + 1000))) {
            rows.push(row);
        }
    }
    return rows;
}

function pretty(value: unknown, depth: number): string {
    const pad = ' '.repeat(depth);
    return JSON.stringify(value, null, 2).replace(/\n/g, `\n${pad}`);
}

/** Shared batched JSON exporter. Consumers manage previous output files. */
export async function* writeGhostJson(
    context: MigrateContext,
    outputDir: string,
    {batchSize = 5000, filename: rawFilename = 'posts', filter, onWrite}: WriteGhostJsonOptions
): AsyncGenerator<WrittenFile> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
        throw new RangeError('Export requires a positive integer batchSize.');
    }
    const filename = exportBaseFilename(rawFilename);
    const where = buildPostWhere(filter);
    await context.prepareForExport();
    await mkdir(outputDir, {recursive: true});
    const db = context.db;
    const conjunction = where.sql ? where.sql + ' AND' : 'WHERE';
    const {count: total, max_id: maxId} = db.db
        .prepare(`SELECT COUNT(*) AS count, MAX(id) AS max_id FROM Posts ${where.sql}`)
        .get(...where.params) as {count: number; max_id: number | null};
    const batches = Math.max(1, Math.ceil(total / batchSize));
    let after = 0;
    for (let batch = 0; batch < batches; batch++) {
        const name = batches === 1 ? `${filename}.json` : `${filename}-${batch + 1}.json`;
        const path = resolve(outputDir, name);
        const temporaryPath = `${path}.${randomUUID()}.tmp`;
        try {
            const posts = db.db
                .prepare(`SELECT id, ghost_id FROM Posts ${conjunction} id > ? AND id <= ? ORDER BY id LIMIT ?`)
                .all(...where.params, after, maxId, batchSize) as any[];
            const ids = posts.map(row => row.id as number);
            const upper = posts.length ? (posts[posts.length - 1].id as number) : after;
            const ghostIds = new Map(posts.map(row => [row.id, row.ghost_id]));
            const postTags = queryBatches(ids, part =>
                findByColumn(db, 'PostTags', 'post_id', part, 'post_id, sort_order')
            );
            const postAuthors = queryBatches(ids, part =>
                findByColumn(db, 'PostAuthors', 'post_id', part, 'post_id, sort_order')
            );
            const tags = queryBatches([...new Set(postTags.map(row => row.tag_id as number))], part =>
                findByIds(db, 'Tags', part)
            );
            const authors = queryBatches([...new Set(postAuthors.map(row => row.author_id as number))], part =>
                findByIds(db, 'Authors', part)
            );
            const tagIds = new Map(tags.map(row => [row.id, row.ghost_id]));
            const authorIds = new Map(authors.map(row => [row.id, row.ghost_id]));
            const output = await open(temporaryPath, 'w');
            try {
                await output.writeFile(
                    `{\n  "meta": ${pretty({exported_on: Date.now(), version: '2.0.0'}, 2)},\n  "data": {\n    "posts": [\n`
                );
                let separator = '';
                const postQuery = db.db.prepare(
                    `SELECT * FROM Posts ${conjunction} id > ? AND id <= ? ORDER BY id LIMIT 25`
                );
                while (after < upper) {
                    const rows = postQuery.all(...where.params, after, upper) as any[];
                    for (const row of rows) {
                        await output.writeFile(separator + `      ${pretty(PostContext.toGhostPost(row).post, 6)}`);
                        separator = ',\n';
                        after = row.id;
                    }
                }
                await output.writeFile(
                    `\n    ],\n    "users": ${pretty(
                        authors.map(row => ({id: row.ghost_id, ...JSON.parse(row.data)})),
                        4
                    )},\n    "tags": ${pretty(
                        tags.map(row => ({id: row.ghost_id, ...JSON.parse(row.data)})),
                        4
                    )},\n    "posts_authors": ${pretty(
                        postAuthors.map(row => ({
                            post_id: ghostIds.get(row.post_id),
                            author_id: authorIds.get(row.author_id),
                            sort_order: row.sort_order
                        })),
                        4
                    )},\n    "posts_tags": ${pretty(
                        postTags.map(row => ({
                            post_id: ghostIds.get(row.post_id),
                            tag_id: tagIds.get(row.tag_id),
                            sort_order: row.sort_order
                        })),
                        4
                    )},\n    "posts_meta": [`
                );
                separator = '';
                let metaAfter = ids[0] ? ids[0] - 1 : upper;
                while (metaAfter < upper) {
                    for (const row of postQuery.all(...where.params, metaAfter, upper) as any[]) {
                        const {meta} = PostContext.toGhostPost(row);
                        if (meta) {
                            await output.writeFile(separator + `\n      ${pretty(meta, 6)}`);
                            separator = ',';
                        }
                        metaAfter = row.id;
                    }
                }
                await output.writeFile(`${separator ? '\n    ' : ''}]\n  }\n}\n`);
            } finally {
                await output.close();
            }
            const size = (await stat(temporaryPath)).size;
            await rename(temporaryPath, path);
            const file = {path, name, posts: posts.length, size};
            onWrite?.(file);
            yield file;
        } finally {
            await rm(temporaryPath, {force: true});
        }
    }
}
