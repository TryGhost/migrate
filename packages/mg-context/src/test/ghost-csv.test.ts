import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';
import {AuthorContext, MigrateContext, TagContext, type PostFilter, type WrittenFile} from '../index.js';

const COLUMNS = [
    'title',
    'html',
    'slug',
    'custom_excerpt',
    'type',
    'status',
    'visibility',
    'featured',
    'created_at',
    'updated_at',
    'published_at',
    'feature_image',
    'feature_image_alt',
    'feature_image_caption',
    'meta_title',
    'meta_description',
    'canonical_url',
    'og_image',
    'og_title',
    'og_description',
    'twitter_image',
    'twitter_title',
    'twitter_description',
    'custom_template',
    'codeinjection_head',
    'codeinjection_foot',
    'authors',
    'author_emails',
    'tags'
];

function parseCSV(text: string): string[][] {
    const records: string[][] = [];
    let record: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const character = text[i];
        if (character === '"') {
            if (quoted && text[i + 1] === '"') {
                cell += '"';
                i += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            record.push(cell);
            cell = '';
        } else if (character === '\n' && !quoted) {
            record.push(cell);
            records.push(record);
            record = [];
            cell = '';
        } else {
            cell += character;
        }
    }
    assert.equal(quoted, false);
    assert.deepEqual(record, []);
    assert.equal(cell, '');
    return records;
}

async function withContext(callback: (context: MigrateContext, directory: string) => Promise<void>, emitEvents = true) {
    const context = new MigrateContext({storage: 'memory', emitEvents});
    await context.init();
    const directory = await mkdtemp(join(tmpdir(), 'mg-context-csv-test-'));
    try {
        await callback(context, directory);
    } finally {
        await context.close();
        await rm(directory, {recursive: true, force: true});
    }
}

async function addPost(context: MigrateContext, title: string, slug: string, createdAt = '2026-01-01T00:00:00.000Z') {
    const post = await context.addPost();
    post.set('title', title);
    post.set('slug', slug);
    post.set('created_at', new Date(createdAt));
    post.save(context.db);
    return post;
}

describe('writeGhostCSV', () => {
    it('writes the reference header and a complete HTML post with ordered relationships', async () => {
        await withContext(async (context, directory) => {
            const post = await context.addPost();
            post.set('title', 'Title, "quoted"');
            post.set('slug', 'quoted-post');
            post.set('html', '<p>First, "quoted"\nSecond</p>');
            post.set('custom_excerpt', 'Excerpt');
            post.set('type', 'page');
            post.set('status', 'scheduled');
            post.set('visibility', 'paid');
            post.set('featured', true);
            post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            post.set('updated_at', new Date('2026-01-02T00:00:00.000Z'));
            post.set('published_at', new Date('2026-01-03T00:00:00.000Z'));
            for (const field of COLUMNS.slice(11, 26)) {
                post.set(field, field + ' value');
            }
            post.addTag(new TagContext({initialData: {name: '#Hidden', slug: 'hidden'}}));
            post.addTag(new TagContext({initialData: {name: 'Lorem,   Ipsum', slug: 'lorem-ipsum'}}));
            post.setTagOrder(tags => [tags[1], tags[0]]);
            post.addAuthor(
                new AuthorContext({initialData: {name: 'Other', slug: 'other', email: 'other@example.com'}})
            );
            post.addAuthor(
                new AuthorContext({initialData: {name: 'Doe,   Jane', slug: 'jane', email: 'jane@example.com'}})
            );
            post.setAuthorOrder(authors => [authors[1], authors[0]]);
            post.save(context.db);

            const file = await context.writeGhostCSV(directory);
            assert.equal(file.name, 'posts.csv');
            assert.equal(file.posts, 1);
            assert.equal(file.size, (await stat(file.path)).size);
            const content = await readFile(file.path, 'utf8');
            assert.ok(content.includes('"Title, ""quoted"""'));
            assert.ok(content.includes('"<p>First, ""quoted""\nSecond</p>"'));
            const [header, values] = parseCSV(content);
            assert.deepEqual(header, COLUMNS);
            const row = Object.fromEntries(header.map((column, index) => [column, values[index]]));
            assert.equal(row.title, 'Title, "quoted"');
            assert.equal(row.html, '<p>First, "quoted"\nSecond</p>');
            assert.equal(row.slug, 'quoted-post');
            assert.equal(row.custom_excerpt, 'Excerpt');
            assert.equal(row.status, 'draft');
            assert.equal(row.type, 'page');
            assert.equal(row.visibility, 'paid');
            assert.equal(row.featured, 'true');
            assert.equal(row.created_at, '2026-01-01T00:00:00.000Z');
            assert.equal(row.updated_at, '2026-01-02T00:00:00.000Z');
            assert.equal(row.published_at, '2026-01-03T00:00:00.000Z');
            for (const field of COLUMNS.slice(11, 26)) {
                assert.equal(row[field], field + ' value');
            }
            assert.equal(row.authors, 'Doe Jane, Other');
            assert.equal(row.author_emails, 'jane@example.com, other@example.com');
            assert.equal(row.tags, 'Lorem Ipsum, #Hidden');
            assert.equal((await context.findPosts({slug: 'quoted-post'}))![0].data.status, 'scheduled');
            assert.equal((await context.findPosts({slug: 'quoted-post'}))![0].data.tags[0].data.name, 'Lorem,   Ipsum');
        });
    });

    it('writes a header-only file and leaves absent values empty', async () => {
        await withContext(async (context, directory) => {
            const empty = await context.writeGhostCSV(join(directory, 'nested'), {filename: 'empty.csv'});
            assert.equal(empty.name, 'empty.csv');
            assert.equal(empty.posts, 0);
            assert.equal(await readFile(empty.path, 'utf8'), COLUMNS.join(',') + '\n');

            await addPost(context, 'Bare post', 'bare');
            const file = await context.writeGhostCSV(directory, {filename: 'bare'});
            const [header, values] = parseCSV(await readFile(file.path, 'utf8'));
            const row = Object.fromEntries(header.map((column, index) => [column, values[index]]));
            assert.equal(row.html, '');
            assert.equal(row.updated_at, '');
            assert.equal(row.published_at, '');
            assert.equal(row.authors, '');
            assert.equal(row.author_emails, '');
            assert.equal(row.tags, '');
            assert.equal(row.featured, 'false');
            assert.equal(row.status, 'draft');
            assert.equal(row.type, 'post');
        }, false);
    });

    it('converts sent to draft in CSV only and keeps JSON unchanged', async () => {
        await withContext(async (context, directory) => {
            const post = await addPost(context, 'Sent post', 'sent-post');
            post.set('status', 'sent');
            post.save(context.db);

            const csv = await context.writeGhostCSV(directory);
            const [, values] = parseCSV(await readFile(csv.path, 'utf8'));
            assert.equal(values[COLUMNS.indexOf('status')], 'draft');
            const [json] = await context.writeGhostJson(directory);
            const exported = JSON.parse(await readFile(json.path, 'utf8'));
            assert.equal(exported.data.posts[0].status, 'sent');
            assert.ok(existsSync(csv.path));
        });
    });

    it('uses the same tag, author, and date filters as JSON without losing later batches', async () => {
        await withContext(async (context, directory) => {
            const fixtures = [
                {title: 'A', date: '2026-01-01', published: '2026-01-02', tags: ['news'], author: 'alice'},
                {title: 'B', date: '2026-02-01', published: null, tags: ['news'], author: 'bob'},
                {title: 'C', date: '2026-03-01', published: null, tags: ['tech'], author: 'alice'},
                {title: 'D', date: '2026-04-01', published: '2026-04-02', tags: ['tech'], author: 'bob'},
                {title: 'E', date: '2026-05-01', published: '2026-05-02', tags: ['news', 'tech'], author: 'alice'}
            ];
            for (const item of fixtures) {
                const post = await context.addPost();
                post.set('title', item.title);
                post.set('slug', item.title.toLowerCase());
                post.set('created_at', new Date(item.date + 'T00:00:00.000Z'));
                if (item.published) {
                    post.set('published_at', new Date(item.published + 'T00:00:00.000Z'));
                }
                for (const tag of item.tags) {
                    post.addTag(new TagContext({initialData: {name: tag === 'news' ? 'News' : 'Tech', slug: tag}}));
                }
                post.addAuthor(
                    new AuthorContext({
                        initialData: {
                            name: item.author === 'alice' ? 'Alice' : 'Bob',
                            slug: item.author,
                            email: item.author + '@example.com'
                        }
                    })
                );
                post.save(context.db);
            }

            const cases: Array<{filter: PostFilter; titles: string[]}> = [
                {filter: {tag: {slug: 'news'}}, titles: ['A', 'B', 'E']},
                {filter: {tag: {name: 'Tech'}}, titles: ['C', 'D', 'E']},
                {filter: {tag: {slug: 'news', name: 'Tech'}}, titles: ['A', 'B', 'E']},
                {filter: {author: {slug: 'alice'}}, titles: ['A', 'C', 'E']},
                {filter: {author: {name: 'Bob'}}, titles: ['B', 'D']},
                {filter: {author: {email: 'alice@example.com'}}, titles: ['A', 'C', 'E']},
                {filter: {author: {slug: 'alice', name: 'Bob', email: 'bob@example.com'}}, titles: ['A', 'C', 'E']},
                {filter: {tag: {slug: 'news'}, author: {slug: 'bob'}}, titles: ['B']},
                {filter: {createdAt: {after: new Date('2026-02-01T00:00:00.000Z')}}, titles: ['C', 'D', 'E']},
                {filter: {createdAt: {onOrBefore: new Date('2026-02-01T00:00:00.000Z')}}, titles: ['A', 'B']},
                {filter: {publishedAt: {before: new Date('2026-05-02T00:00:00.000Z')}}, titles: ['A', 'D']},
                {filter: {publishedAt: {onOrAfter: new Date('2026-04-02T00:00:00.000Z')}}, titles: ['D', 'E']},
                {filter: {publishedAt: {}}, titles: ['A', 'D', 'E']},
                {
                    filter: {tag: {name: 'News'}, createdAt: {after: new Date('2026-02-01T00:00:00.000Z')}},
                    titles: ['E']
                },
                {filter: {tag: {}}, titles: []},
                {filter: {author: {}}, titles: []},
                {filter: {tag: {slug: 'missing'}}, titles: []}
            ];
            for (const {filter, titles} of cases) {
                const file = await context.writeGhostCSV(directory, {filename: 'filtered', filter});
                const records = parseCSV(await readFile(file.path, 'utf8'));
                assert.deepEqual(
                    records.slice(1).map(row => row[0]),
                    titles
                );
                assert.equal(file.posts, titles.length);
            }
        });
    });

    it('streams multiple batches and reports progress', async () => {
        await withContext(async (context, directory) => {
            for (let i = 0; i < 405; i += 1) {
                const post = await context.addPost();
                post.set('title', 'Post ' + i);
                post.set('slug', 'post-' + i);
                post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
                post.addTag(new TagContext({initialData: {name: 'Shared', slug: 'shared'}}));
                post.save(context.db);
            }
            const progress: number[] = [];
            context.on('progress', event => {
                if (event.operation === 'writeGhostCSV') {
                    progress.push(event.processed);
                    assert.equal(event.total, 405);
                }
            });
            const file = await context.writeGhostCSV(directory, {filter: {tag: {slug: 'shared'}}});
            assert.equal(file.posts, 405);
            assert.equal(parseCSV(await readFile(file.path, 'utf8')).length, 406);
            assert.deepEqual(progress, [200, 400, 405]);
        });
    });

    it('upgrades a v1 manifest, preserves JSON, and cleans only prior CSV output', async () => {
        await withContext(async (context, directory) => {
            await addPost(context, 'Owned post', 'owned');
            const manifestPath = join(directory, '.mg-context-export-manifest.json');
            await writeFile(join(directory, 'old.json'), 'existing JSON');
            await writeFile(join(directory, 'unrelated.csv'), 'user CSV');
            await writeFile(manifestPath, JSON.stringify({version: 1, exports: {posts: ['old.json']}}));

            const first = await context.writeGhostCSV(directory, {filename: 'first.csv'});
            let manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            assert.equal(manifest.version, 2);
            assert.deepEqual(manifest.exports, {posts: ['old.json'], 'posts-csv': ['first.csv']});
            assert.equal(await readFile(join(directory, 'old.json'), 'utf8'), 'existing JSON');

            const second = await context.writeGhostCSV(directory, {filename: 'second'});
            assert.equal(second.name, 'second.csv');
            await assert.rejects(stat(first.path), {code: 'ENOENT'});
            assert.equal(await readFile(join(directory, 'unrelated.csv'), 'utf8'), 'user CSV');

            const [json] = await context.writeGhostJson(directory, {filename: 'new-json'});
            assert.ok(existsSync(second.path));
            assert.ok(existsSync(json.path));
            manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            assert.deepEqual(manifest.exports, {posts: ['new-json.json'], 'posts-csv': ['second.csv']});
        });
    });

    it('keeps the previous CSV and manifest when streaming is interrupted', async () => {
        await withContext(async (context, directory) => {
            await addPost(context, 'Original', 'original');
            const previous = await context.writeGhostCSV(directory);
            const previousContent = await readFile(previous.path, 'utf8');
            const manifestPath = join(directory, '.mg-context-export-manifest.json');
            const previousManifest = await readFile(manifestPath, 'utf8');
            for (let i = 0; i < 200; i += 1) {
                await addPost(context, 'Later ' + i, 'later-' + i);
            }
            const listener = (event: {operation: string}) => {
                if (event.operation === 'writeGhostCSV') {
                    throw new Error('stop export');
                }
            };
            context.on('progress', listener);
            await assert.rejects(() => context.writeGhostCSV(directory), {message: 'stop export'});
            context.off('progress', listener);
            assert.equal(await readFile(previous.path, 'utf8'), previousContent);
            assert.equal(await readFile(manifestPath, 'utf8'), previousManifest);
            assert.deepEqual((await readdir(directory)).sort(), ['.mg-context-export-manifest.json', 'posts.csv']);
        });
    });

    it('emits the file event after commit and propagates listener errors', async () => {
        await withContext(async (context, directory) => {
            await addPost(context, 'Event', 'event');
            const seen: WrittenFile[] = [];
            context.on('export:file-written', file => {
                seen.push(file);
                assert.ok(existsSync(file.path));
                assert.ok(
                    readFileSync(join(directory, '.mg-context-export-manifest.json'), 'utf8').includes('posts.csv')
                );
                throw new Error('listener failed');
            });
            await assert.rejects(() => context.writeGhostCSV(directory), {message: 'listener failed'});
            assert.equal(seen.length, 1);
            assert.equal(seen[0].posts, 1);
            assert.ok(existsSync(seen[0].path));
        });
    });

    it('rejects invalid filenames and malformed ownership manifests', async () => {
        await withContext(async (context, directory) => {
            for (const filename of ['.csv', '', 'nested/file', 'nested\\file']) {
                await assert.rejects(() => context.writeGhostCSV(directory, {filename}), {
                    name: 'BadRequestError',
                    message: 'Ghost CSV filename must be a non-empty base filename without path separators.'
                });
            }
            const manifestPath = join(directory, '.mg-context-export-manifest.json');
            for (const invalid of [
                {version: 1, exports: {'posts-csv': ['old.csv']}},
                {version: 2, exports: {'posts-csv': ['old.json']}},
                {version: 2, exports: {'posts-csv': ['../old.csv']}},
                {version: 2, exports: {'posts-csv': ['nested\\old.csv']}},
                {version: 3, exports: {}}
            ]) {
                await writeFile(manifestPath, JSON.stringify(invalid));
                await assert.rejects(() => context.writeGhostCSV(directory), {
                    name: 'InternalServerError',
                    message:
                        'Could not read .mg-context-export-manifest.json. Remove or repair it before exporting again.'
                });
            }
        });
    });
});
