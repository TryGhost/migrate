import assert from 'node:assert/strict';
import {describe, it, before, after, mock} from 'node:test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {mkdir, readFile, stat, unlink, rm, writeFile} from 'node:fs/promises';
import errors from '@tryghost/errors';
import {
    MigrateContext,
    PostContext,
    TagContext,
    AuthorContext,
    MIGRATE_CONTEXT_SCHEMA_VERSION,
    type PostFilter,
    type WrittenFile
} from '../index.js';
import {withTransaction, findPostsByIds} from '../lib/db-helpers.js';
import {fingerprintContentIdentity} from '../lib/content-identity.js';
import {createDatabase} from '../lib/database.js';
import {MG_CONTEXT_V2_SCHEMA} from './fixtures/mg-context-v2.js';

const TEST_CONTENT_IDENTITY = {
    source: 'mg-context-test',
    revision: 'test-source-v1'
};

describe('MigrateContext', () => {
    it('Is instance of', () => {
        const instance: any = new MigrateContext();

        assert.equal(instance instanceof MigrateContext, true);
    });

    it('Throws when accessing db before init', () => {
        const instance: any = new MigrateContext();

        assert.throws(() => instance.db, {
            name: 'InternalServerError',
            message: 'Database not initialized. Call init() first.'
        });
    });

    it('Can init and close', async () => {
        const instance: any = new MigrateContext();
        await instance.init();
        assert.ok(instance.db);
        await instance.close();
    });

    describe('database lifecycle', () => {
        it('Uses a managed temporary on-disk database by default and removes it on close', async () => {
            const instance = new MigrateContext();
            await instance.init();

            const databasePath = instance.databasePath;
            assert.notEqual(databasePath, ':memory:');
            assert.ok((await stat(databasePath)).isFile());

            await instance.close();
            await assert.rejects(stat(databasePath), {code: 'ENOENT'});
        });

        it('Uses memory only when explicitly requested', async () => {
            const instance = new MigrateContext({storage: 'memory'});
            await instance.init();
            assert.equal(instance.databasePath, ':memory:');
            await instance.close();
        });

        it('Retains ephemeral as a one-release memory compatibility shim', async () => {
            const instance = new MigrateContext({ephemeral: true});
            await instance.init();
            assert.equal(instance.databasePath, ':memory:');
            await instance.close();
        });

        it('Rejects conflicting storage options', () => {
            assert.throws(() => new MigrateContext({dbPath: 'migration.sqlite', storage: 'memory'}), {
                name: 'BadRequestError',
                message: 'Pass either dbPath or storage, not both.'
            });
        });

        it('Requires content identity for every persistent resume, including a new database', () => {
            assert.throws(() => new MigrateContext({dbPath: 'migration.sqlite'}), {
                name: 'BadRequestError',
                message:
                    'Persistent resume requires contentIdentity. Pass a source revision, or use rereadSource: true to read the export again.'
            });
            assert.doesNotThrow(() => new MigrateContext({dbPath: 'migration.sqlite', mode: 'refresh'}));
            assert.doesNotThrow(() => new MigrateContext({dbPath: 'migration.sqlite', rereadSource: true}));
            assert.doesNotThrow(() => new MigrateContext());
        });

        it('Validates source replay options', () => {
            assert.throws(() => new MigrateContext({rereadSource: 'yes' as any}), {
                name: 'BadRequestError',
                message: 'rereadSource must be a boolean.'
            });
            assert.throws(() => new MigrateContext({mapSourcePost: 'mapper' as any}), {
                name: 'BadRequestError',
                message: 'mapSourcePost must be a function.'
            });
        });

        it('Does not let an invalid path or mode bypass persistent resume validation', () => {
            assert.throws(() => new MigrateContext({dbPath: ''}), {
                name: 'BadRequestError',
                message: 'dbPath must be a non-empty path.'
            });
            assert.throws(() => new MigrateContext({dbPath: 3 as any}), {
                name: 'BadRequestError',
                message: 'dbPath must be a non-empty path.'
            });
            assert.throws(() => new MigrateContext({dbPath: 'migration.sqlite', mode: 'other' as any}), {
                name: 'BadRequestError',
                message: 'mode must be "resume" or "refresh".'
            });
        });

        it('Does not accept the removed contentFingerprint option as identity', () => {
            assert.throws(() => new MigrateContext({dbPath: 'migration.sqlite', contentFingerprint: 'legacy'} as any), {
                name: 'BadRequestError',
                message:
                    'Persistent resume requires contentIdentity. Pass a source revision, or use rereadSource: true to read the export again.'
            });
        });

        it('Reports the schema version and whether migration content exists', async () => {
            const instance = new MigrateContext();
            await instance.init();

            assert.equal(instance.schemaVersion, MIGRATE_CONTEXT_SCHEMA_VERSION);
            assert.equal(instance.hasContent(), false);

            instance.addLink('example.com/existing/', '/existing/');
            assert.deepEqual(instance.hasContent(), {
                posts: 0,
                pages: 0,
                users: 0,
                tags: 0,
                userAssociations: 0,
                tagAssociations: 0,
                links: 1
            });

            instance.reset();
            assert.equal(instance.hasContent(), false);
            await instance.close();
        });

        it('Clears run-specific reports when the same context is reinitialized', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            for (const title of ['First', 'Second']) {
                const post = await instance.addPost();
                post.set('title', title);
                post.set('slug', 'duplicate');
                post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
                await post.save(instance.db);
            }

            assert.equal((await instance.deduplicateSlugs()).length, 2);
            await instance.close();

            await instance.init();
            assert.deepEqual(instance.duplicateSlugs, []);
            assert.deepEqual(await instance.deduplicateSlugs(), []);
            await instance.close();
        });

        it('Resets all managed content, sequences, and in-memory state', async () => {
            const instance: any = new MigrateContext();
            await instance.init();
            instance.setFingerprint('source', 'source-v1');

            const first = await instance.addPost();
            first.set('title', 'x'.repeat(300));
            first.set('slug', 'reset-post');
            first.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            first.addTag({name: 'Reset Tag', slug: 'reset-tag'});
            first.addAuthor({name: 'Reset Author', slug: 'reset-author', email: 'reset@example.com'});
            await first.save(instance.db);

            const duplicate = await instance.addPost();
            duplicate.set('title', 'Duplicate');
            duplicate.set('slug', 'reset-post');
            duplicate.set('type', 'page');
            duplicate.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await duplicate.save(instance.db);
            instance.addLink('example.com/reset-post/', '/reset-post/');

            assert.deepEqual(instance.hasContent(), {
                posts: 1,
                pages: 1,
                users: 1,
                tags: 1,
                userAssociations: 1,
                tagAssociations: 1,
                links: 1
            });
            assert.equal((await instance.deduplicateSlugs()).length, 2);
            assert.ok(instance.db.tagCache.size > 0);
            assert.ok(instance.db.authorCache.size > 0);
            assert.ok(instance.db.slugRenames.length > 0);
            assert.ok(instance.sanitizedFields.length > 0);

            instance.reset();

            assert.equal(instance.hasContent(), false);
            assert.equal(instance.getFingerprint('source'), null);
            assert.equal(instance.db.tagCache.size, 0);
            assert.equal(instance.db.authorCache.size, 0);
            assert.equal(instance.db.slugRenames.length, 0);
            assert.equal(instance.sanitizedFields.length, 0);
            assert.deepEqual(instance.duplicateSlugs, []);

            for (const table of ['Posts', 'Tags', 'Authors', 'PostTags', 'PostAuthors', 'Links']) {
                const row = instance.db.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {count: number};
                assert.equal(row.count, 0);
            }

            const replacement = await instance.addPost();
            replacement.set('title', 'Replacement');
            replacement.set('slug', 'reset-post');
            replacement.set('created_at', new Date('2023-11-25T12:00:00.000Z'));
            replacement.addTag({name: 'Reset Tag', slug: 'reset-tag'});
            replacement.addAuthor({name: 'Reset Author', slug: 'reset-author', email: 'reset@example.com'});
            await replacement.save(instance.db);

            const secondDuplicate = await instance.addPost();
            secondDuplicate.set('title', 'Replacement Duplicate');
            secondDuplicate.set('slug', 'reset-post');
            secondDuplicate.set('created_at', new Date('2023-11-26T12:00:00.000Z'));
            await secondDuplicate.save(instance.db);

            assert.equal(replacement.dbId, 1);
            assert.equal(replacement.data.tags[0].dbId, 1);
            assert.equal(replacement.data.authors[0].dbId, 1);
            assert.equal((await instance.deduplicateSlugs()).length, 2);

            await instance.close();
        });

        it('Persists opaque fingerprints and can preserve them across a content reset', async () => {
            const filePath = join(tmpdir(), `mg-context-fingerprint-test-${Date.now()}.sqlite`);
            const firstRun = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await firstRun.init();

            assert.equal(firstRun.getFingerprint('source'), null);
            assert.equal(firstRun.matchesFingerprint('source', 'source-v1'), false);

            firstRun.setFingerprint('source', 'source-v1');
            firstRun.setFingerprint('transform', 'options-v1');
            assert.equal(firstRun.matchesFingerprint('source', 'source-v1'), true);
            assert.equal(firstRun.hasContent(), false);

            firstRun.setFingerprint('transform', 'options-v2');
            assert.equal(firstRun.getFingerprint('transform'), 'options-v2');

            firstRun.deleteFingerprint('transform');
            assert.equal(firstRun.getFingerprint('transform'), null);
            await firstRun.close();

            const secondRun = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await secondRun.init();
            assert.equal(secondRun.schemaVersion, MIGRATE_CONTEXT_SCHEMA_VERSION);
            assert.equal(secondRun.getFingerprint('source'), 'source-v1');

            secondRun.addLink('example.com/cached/', '/cached/');
            secondRun.reset({preserveFingerprints: true});
            assert.equal(secondRun.hasContent(), false);
            assert.equal(secondRun.getFingerprint('source'), 'source-v1');

            await secondRun.close();
            await rm(filePath, {force: true});
        });

        it('Uses content identity to make resume and refresh intent explicit', async () => {
            const filePath = join(tmpdir(), `mg-context-content-identity-mode-${Date.now()}.sqlite`);
            const contentIdentity = {...TEST_CONTENT_IDENTITY, revision: 'source-and-options-v1'};
            const firstRun = new MigrateContext({dbPath: filePath, contentIdentity});
            await firstRun.init();
            const post = await firstRun.addPost({lookupKey: 'post-1', sourceContent: '{"title":"Version one"}'});
            post.set('title', 'Version one');
            post.set('slug', 'version-one');
            post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            post.save(firstRun.db);
            await firstRun.close();

            const resumed = new MigrateContext({
                dbPath: filePath,
                contentIdentity,
                mapSourcePost: sourcePost => {
                    sourcePost.set('title', JSON.parse(sourcePost.sourceContent!).title);
                    sourcePost.set('slug', 'version-one');
                    sourcePost.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
                }
            });
            await resumed.init();
            const resumedStats = resumed.hasContent();
            assert.ok(resumedStats);
            assert.equal(resumedStats.posts, 1);
            await resumed.close();

            const incompatible = new MigrateContext({
                dbPath: filePath,
                contentIdentity: {...contentIdentity, revision: 'source-and-options-v2'}
            });
            await assert.rejects(() => incompatible.init(), {
                name: 'InternalServerError',
                message:
                    'The stored migration content has a different or missing source identity. Re-run with rereadSource: true to read the export again.'
            });

            const refreshed = new MigrateContext({
                dbPath: filePath,
                mode: 'refresh',
                contentIdentity: {...contentIdentity, revision: 'source-and-options-v2'}
            });
            await refreshed.init();
            assert.equal(refreshed.hasContent(), false);
            assert.equal(
                refreshed.getFingerprint('content'),
                fingerprintContentIdentity({...contentIdentity, revision: 'source-and-options-v2'})
            );
            assert.equal(refreshed.getMigrationReport().events.length, 0);
            await refreshed.close();
            await rm(filePath, {force: true});
        });

        it('Rebuilds complete mapped posts from saved source on every resume', async () => {
            const filePath = join(tmpdir(), `mg-context-raw-replay-${Date.now()}.sqlite`);
            let mapperVersion = 1;
            const mapSourcePost = (post: PostContext) => {
                const raw = JSON.parse(post.sourceContent!);
                post.set('title', mapperVersion === 1 ? raw.title : `${raw.title} remapped`);
                post.set('slug', raw.slug);
                post.set('html', mapperVersion === 1 ? raw.html : '<p>New HTML</p>');
                post.set('created_at', new Date(raw.createdAt));
                post.addTag(
                    new TagContext({
                        initialData: {
                            name: mapperVersion === 1 ? 'Old Tag' : 'New Tag',
                            slug: mapperVersion === 1 ? 'old-tag' : 'new-tag'
                        }
                    })
                );
                post.addAuthor(
                    new AuthorContext({
                        initialData: {
                            name: mapperVersion === 1 ? 'Old Author' : 'New Author',
                            slug: mapperVersion === 1 ? 'old-author' : 'new-author',
                            email: 'author@example.com'
                        }
                    })
                );
            };
            const rawText = JSON.stringify({
                title: 'Original title',
                slug: 'replay-me',
                html: '<p>Old HTML</p>',
                createdAt: '2026-01-01T00:00:00.000Z'
            });
            const first = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY, mapSourcePost});
            await first.init();
            const inserted = await first.addSourcePost({
                lookupKey: 'raw-1',
                sourceContent: rawText,
                sourceMeta: {url: 'https://example.com/replay-me'}
            });
            const databaseId = inserted.dbId;
            const ghostId = inserted.ghostId;
            await first.close();

            mapperVersion = 2;
            const second = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost
            });
            const replacements: any[] = [];
            const progress: any[] = [];
            second.on('post:replaced', event => replacements.push(event));
            second.on('progress', event => progress.push(event));
            await second.init();
            const [replayed] = await second.getAllPosts();
            assert.equal(replayed.dbId, databaseId);
            assert.equal(replayed.ghostId, ghostId);
            assert.equal(replayed.sourceContent, rawText);
            assert.deepEqual(replayed.sourceMeta, {url: 'https://example.com/replay-me'});
            assert.equal(replayed.data.title, 'Original title remapped');
            assert.equal(replayed.data.html, '<p>New HTML</p>');
            assert.deepEqual(
                replayed.data.tags.map((tag: TagContext) => tag.data.slug),
                ['new-tag']
            );
            assert.deepEqual(
                replayed.data.authors.map((author: AuthorContext) => author.data.slug),
                ['new-author']
            );
            assert.equal(replacements.length, 1);
            assert.equal(replacements[0].previous.sourceContent, rawText);
            assert.equal(replacements[0].previous.data.html, '<p>Old HTML</p>');
            assert.equal(replacements[0].current.data.html, '<p>New HTML</p>');
            assert.deepEqual(progress, [{operation: 'replaySourcePosts', processed: 1, total: 1}]);
            replacements[0].current.sourceMeta.url = 'changed by listener';
            assert.equal((await second.getAllPosts())[0].getSourceValue('url'), 'https://example.com/replay-me');
            await second.close();

            const silent = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost,
                emitEvents: false
            });
            let emitted = false;
            silent.on('progress', () => {
                emitted = true;
            });
            await silent.init();
            assert.equal(emitted, false);
            await silent.close();
            await rm(filePath, {force: true});
        });

        it('Rereads the source only when explicitly requested', async () => {
            const filePath = join(tmpdir(), `mg-context-reread-${Date.now()}.sqlite`);
            const mapper = (post: PostContext) => {
                post.set('title', post.sourceContent!);
                post.set('slug', 'reread');
                post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            };
            const first = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: mapper
            });
            await first.init();
            await first.addSourcePost({lookupKey: 'old', sourceContent: 'Old source'});
            await first.close();

            const reread = new MigrateContext({dbPath: filePath, rereadSource: true, mapSourcePost: mapper});
            await reread.init();
            assert.equal(reread.hasContent(), false);
            await reread.addSourcePost({lookupKey: 'new', sourceContent: 'New source'});
            assert.equal((await reread.getAllPosts())[0].sourceContent, 'New source');
            await reread.close();
            await rm(filePath, {force: true});
        });

        it('Rejects resume when saved posts cannot be replayed', async () => {
            const filePath = join(tmpdir(), `mg-context-unreplayable-${Date.now()}.sqlite`);
            const first = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await first.init();
            const post = await first.addPost({lookupKey: 'raw', sourceContent: 'Raw'});
            post.set('title', 'Raw');
            post.set('slug', 'raw');
            post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            post.save(first.db);
            await first.close();

            const withoutMapper = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await assert.rejects(withoutMapper.init(), {
                name: 'BadRequestError',
                message: 'Persistent resume requires mapSourcePost to rebuild stored posts from source content.'
            });

            const v3 = new DatabaseSync(filePath);
            v3.prepare('UPDATE Posts SET source_content = NULL').run();
            v3.close();
            const withMapper = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: () => {}
            });
            await assert.rejects(withMapper.init(), {
                name: 'BadRequestError',
                message:
                    'Stored posts without sourceContent or lookupKey cannot be replayed. Re-run with rereadSource: true to read the export again.'
            });
            await rm(filePath, {force: true});
        });

        it('Requires raw content and lookup keys when saving persistent posts', async () => {
            const filePath = join(tmpdir(), `mg-context-raw-required-${Date.now()}.sqlite`);
            const ctx = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await ctx.init();
            const missingContent = await ctx.addPost({lookupKey: 'missing-content'});
            assert.throws(() => missingContent.save(ctx.db), {
                name: 'BadRequestError',
                message: 'Persistent posts require sourceContent and lookupKey for replay.'
            });
            const missingKey = await ctx.addPost({sourceContent: '<item />'});
            assert.throws(() => missingKey.save(ctx.db), {
                name: 'BadRequestError',
                message: 'Persistent posts require sourceContent and lookupKey for replay.'
            });
            await assert.rejects(ctx.addSourcePost({lookupKey: 'raw', sourceContent: 'raw'}), {
                name: 'BadRequestError',
                message: 'addSourcePost requires mapSourcePost.'
            });
            await ctx.close();
            await rm(filePath, {force: true});
        });

        it('Stops replay cleanly if a mapper removes the remaining source rows', async () => {
            const filePath = join(tmpdir(), `mg-context-replay-deleted-tail-${Date.now()}.sqlite`);
            let activeContext: MigrateContext | undefined;
            let deleteTail = false;
            const mapper = (post: PostContext) => {
                post.set('title', post.sourceContent!);
                post.set('slug', post.lookupKey!);
                post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
                if (deleteTail && post.lookupKey === 'post-1') {
                    activeContext!.db.db.prepare('DELETE FROM Posts WHERE lookup_key = ?').run('post-101');
                }
            };
            const first = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: mapper
            });
            await first.init();
            for (let index = 1; index <= 101; index += 1) {
                await first.addSourcePost({lookupKey: `post-${index}`, sourceContent: `Post ${index}`});
            }
            await first.close();

            deleteTail = true;
            const second = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: mapper
            });
            activeContext = second;
            await second.init();
            assert.equal((await second.getAllPosts()).length, 100);
            await second.close();
            await rm(filePath, {force: true});
        });

        it('Can retry a partial replay after a mapper error', async () => {
            const filePath = join(tmpdir(), `mg-context-replay-retry-${Date.now()}.sqlite`);
            let version = 'old';
            let failOnSecond = false;
            const mapper = (post: PostContext) => {
                if (failOnSecond && post.lookupKey === 'second') {
                    throw new Error('mapper failed');
                }
                post.set('title', `${post.sourceContent} ${version}`);
                post.set('slug', post.lookupKey!);
                post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            };
            const first = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: mapper
            });
            await first.init();
            await first.addSourcePost({lookupKey: 'first', sourceContent: 'First'});
            await first.addSourcePost({lookupKey: 'second', sourceContent: 'Second'});
            await first.close();

            version = 'new';
            failOnSecond = true;
            const interrupted = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: mapper
            });
            await assert.rejects(interrupted.init(), {message: 'mapper failed'});
            const partial = new DatabaseSync(filePath);
            const titles = partial
                .prepare('SELECT data FROM Posts ORDER BY id')
                .all()
                .map((row: any) => JSON.parse(row.data).title);
            assert.deepEqual(titles, ['First new', 'Second old']);
            partial.close();

            failOnSecond = false;
            const resumed = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: mapper
            });
            await resumed.init();
            assert.deepEqual(
                (await resumed.getAllPosts()).map(post => post.data.title),
                ['First new', 'Second new']
            );
            await resumed.close();
            await rm(filePath, {force: true});
        });

        it('Matches a structured source identity and rejects changed source or input options', async () => {
            const filePath = join(tmpdir(), `mg-context-content-identity-${Date.now()}.sqlite`);
            const contentIdentity = {
                source: 'wordpress-export:site.xml',
                revision: 'sha256:source-v1',
                options: {featureImage: true, shortcodes: ['gallery', 'caption']}
            };
            const firstRun = new MigrateContext({dbPath: filePath, contentIdentity});
            await firstRun.init();
            firstRun.addLink('example.com/old/', '/new/');
            const storedFingerprint = firstRun.getFingerprint('content');
            assert.match(storedFingerprint!, /^sha256:[a-f0-9]{64}$/);
            await firstRun.close();

            const resumed = new MigrateContext({
                dbPath: filePath,
                contentIdentity: {
                    ...contentIdentity,
                    options: {shortcodes: ['gallery', 'caption'], featureImage: true}
                }
            });
            await resumed.init();
            assert.equal(resumed.getFingerprint('content'), storedFingerprint);
            assert.equal(resumed.findLink('example.com/old/'), '/new/');
            await resumed.close();

            for (const changedIdentity of [
                {...contentIdentity, source: 'wordpress-export:another.xml'},
                {...contentIdentity, revision: 'sha256:source-v2'},
                {...contentIdentity, options: {...contentIdentity.options, featureImage: false}}
            ]) {
                const incompatible = new MigrateContext({dbPath: filePath, contentIdentity: changedIdentity});
                await assert.rejects(() => incompatible.init(), {
                    name: 'InternalServerError',
                    message:
                        'The stored migration content has a different or missing source identity. Re-run with rereadSource: true to read the export again.'
                });
            }

            const refreshed = new MigrateContext({
                dbPath: filePath,
                mode: 'refresh',
                contentIdentity: {
                    ...contentIdentity,
                    revision: 'sha256:source-v2'
                }
            });
            await refreshed.init();
            assert.equal(refreshed.hasContent(), false);
            assert.notEqual(refreshed.getFingerprint('content'), storedFingerprint);
            await refreshed.close();
            await rm(filePath, {force: true});
        });

        it('Rejects populated legacy databases without a stored content identity', async () => {
            const filePath = join(tmpdir(), `mg-context-unidentified-${Date.now()}.sqlite`);
            const original = new MigrateContext({dbPath: filePath, mode: 'refresh'});
            await original.init();
            original.addLink('example.com/old/', '/new/');
            await original.close();

            const resumed = new MigrateContext({
                dbPath: filePath,
                contentIdentity: {source: 'source', revision: 'revision'}
            });
            await assert.rejects(() => resumed.init(), {
                name: 'InternalServerError',
                message:
                    'The stored migration content has a different or missing source identity. Re-run with rereadSource: true to read the export again.'
            });
            await rm(filePath, {force: true});
        });

        it('Migrates the frozen v2 fixture transactionally and preserves its content', async () => {
            const filePath = join(tmpdir(), `mg-context-v2-fixture-${Date.now()}.sqlite`);
            const v2 = new DatabaseSync(filePath);
            v2.exec(MG_CONTEXT_V2_SCHEMA);
            v2.prepare('INSERT INTO Links (old_url, new_url) VALUES (?, ?)').run('example.com/old/', '/new/');
            v2.prepare('INSERT INTO Fingerprints (name, value) VALUES (?, ?)').run(
                'content',
                fingerprintContentIdentity(TEST_CONTENT_IDENTITY)
            );
            v2.close();

            const instance = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await instance.init();

            assert.equal(instance.schemaVersion, 4);
            assert.equal(instance.findLink('example.com/old/'), '/new/');
            assert.ok(
                instance.db.db
                    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'MigrationEvents'")
                    .get()
            );

            await instance.close();
            await rm(filePath, {force: true});
        });

        it('Migrates v3 source metadata without inventing missing raw content', async () => {
            const filePath = join(tmpdir(), `mg-context-v3-fixture-${Date.now()}.sqlite`);
            const oldDb = new DatabaseSync(filePath);
            oldDb.exec(MG_CONTEXT_V2_SCHEMA);
            oldDb.exec(`
                CREATE TABLE MigrationEvents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL,
                    post_id INTEGER,
                    lookup_key TEXT,
                    details TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );
                PRAGMA user_version = 3;
            `);
            oldDb
                .prepare('INSERT INTO Posts (data, source, meta, lookup_key) VALUES (?, ?, ?, ?)')
                .run(
                    JSON.stringify({title: 'Old mapped post'}),
                    JSON.stringify({url: 'https://example.com/old'}),
                    '{}',
                    'old-post'
                );
            oldDb
                .prepare('INSERT INTO Fingerprints (name, value) VALUES (?, ?)')
                .run('content', fingerprintContentIdentity(TEST_CONTENT_IDENTITY));
            oldDb.close();

            const migrated = createDatabase(filePath);
            const row = migrated.stmts.findPostByLookupKey.get('old-post') as any;
            assert.equal(migrated.schemaVersion, 4);
            assert.equal(row.source_content, null);
            assert.deepEqual(JSON.parse(row.source_meta), {url: 'https://example.com/old'});
            migrated.db.close();

            const resume = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: () => {}
            });
            await assert.rejects(resume.init(), {
                message:
                    'Stored posts without sourceContent or lookupKey cannot be replayed. Re-run with rereadSource: true to read the export again.'
            });
            const refresh = new MigrateContext({dbPath: filePath, rereadSource: true});
            await refresh.init();
            assert.equal(refresh.hasContent(), false);
            await refresh.close();
            await rm(filePath, {force: true});
        });

        it('Rejects databases older than the HTML-only compatibility baseline', async () => {
            const filePath = join(tmpdir(), `mg-context-v1-schema-test-${Date.now()}.sqlite`);
            const oldDb = new DatabaseSync(filePath);
            oldDb.exec('CREATE TABLE Posts (id INTEGER PRIMARY KEY);');
            oldDb.exec('PRAGMA user_version = 1;');
            oldDb.close();

            const instance = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await assert.rejects(() => instance.init(), {
                name: 'InternalServerError',
                message: `Database schema version 1 is older than the supported version ${MIGRATE_CONTEXT_SCHEMA_VERSION}. Recreate the database from source.`
            });

            await rm(filePath, {force: true});
        });

        it('Rejects unversioned databases that already contain a migration schema', async () => {
            const filePath = join(tmpdir(), `mg-context-unversioned-schema-test-${Date.now()}.sqlite`);
            const oldDb = new DatabaseSync(filePath);
            oldDb.exec('CREATE TABLE Posts (id INTEGER PRIMARY KEY);');
            oldDb.close();

            const instance = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await assert.rejects(() => instance.init(), {
                name: 'InternalServerError',
                message: 'Unversioned migration databases are not supported. Recreate the database from source.'
            });

            await rm(filePath, {force: true});
        });

        it('Rejects a database created by a newer mg-context schema', async () => {
            const filePath = join(tmpdir(), `mg-context-newer-schema-test-${Date.now()}.sqlite`);
            const db = new DatabaseSync(filePath);
            db.exec(`PRAGMA user_version = ${MIGRATE_CONTEXT_SCHEMA_VERSION + 1};`);
            db.close();

            const instance = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await assert.rejects(() => instance.init(), {
                name: 'InternalServerError',
                message: `Database schema version ${MIGRATE_CONTEXT_SCHEMA_VERSION + 1} is newer than the supported version ${MIGRATE_CONTEXT_SCHEMA_VERSION}.`
            });

            await rm(filePath, {force: true});
        });
    });

    it('Can use file-based DB with dbPath', async () => {
        const filePath = join(tmpdir(), `mg-context-db-test-${Date.now()}.sqlite`);
        const instance: any = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
        await instance.init();

        const post = await instance.addPost({lookupKey: 'file-db-post', sourceContent: '<p>File DB Post</p>'});
        post.set('title', 'File DB Post');
        post.set('slug', 'file-db-post');
        post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        await post.save(instance.db);

        const posts = await instance.getAllPosts();
        assert.equal(posts.length, 1);
        assert.equal(posts[0].data.title, 'File DB Post');

        await instance.close();
        await unlink(filePath);
    });

    it('Can add posts', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = await instance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        await post1.save(instance.db);

        const post2 = await instance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        await post2.save(instance.db);

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts.length, 2);
        assert.equal(allPosts[0].data.title, 'Test Post');
        assert.equal(allPosts[1].data.title, 'Another Post');

        await instance.close();
    });

    describe('updatePostData', () => {
        it('Patches scalar data and scraper output without touching relationships', async () => {
            const instance = new MigrateContext();
            await instance.init();

            const post: any = await instance.addPost();
            post.set('title', 'Original title');
            post.set('slug', 'original-title');
            post.set('html', '<p>Original HTML</p>');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
            post.addTag(new TagContext({name: 'First tag', slug: 'first-tag'}));
            post.addTag(new TagContext({name: 'Second tag', slug: 'second-tag'}));
            post.addAuthor(new AuthorContext({name: 'First author', slug: 'first-author', email: 'first@example.com'}));
            post.addAuthor(
                new AuthorContext({name: 'Second author', slug: 'second-author', email: 'second@example.com'})
            );
            post.save(instance.db);

            assert.ok(post.dbId);
            const postTagsBefore = instance.db.stmts.findPostTagsByPostId.all(post.dbId);
            const postAuthorsBefore = instance.db.stmts.findPostAuthorsByPostId.all(post.dbId);
            const tagRead = mock.method(instance.db.stmts.findPostTagsByPostId, 'all');
            const authorRead = mock.method(instance.db.stmts.findPostAuthorsByPostId, 'all');

            instance.updatePostData(
                post.dbId,
                {
                    title: '  Updated title  ',
                    html: '<p>Enriched HTML</p>',
                    feature_image: `https://example.com/${'x'.repeat(2000)}`,
                    updated_at: new Date('2023-11-25T12:00:00.000Z'),
                    published_at: null
                },
                {webscrapeData: {featureImage: 'downloaded.jpg'}}
            );

            assert.equal(tagRead.mock.callCount(), 0);
            assert.equal(authorRead.mock.callCount(), 0);
            tagRead.mock.restore();
            authorRead.mock.restore();

            const row = instance.db.stmts.findPostById.get(post.dbId) as any;
            const data = JSON.parse(row.data);
            assert.equal(data.title, 'Updated title');
            assert.equal(data.html, '<p>Enriched HTML</p>');
            assert.equal(data.feature_image, null);
            assert.equal(row.created_at, '2023-11-23T12:00:00.000Z');
            assert.equal(row.updated_at, '2023-11-25T12:00:00.000Z');
            assert.equal(row.published_at, null);
            assert.deepEqual(JSON.parse(row.webscrape_data), {featureImage: 'downloaded.jpg'});
            assert.deepEqual(instance.db.stmts.findPostTagsByPostId.all(post.dbId), postTagsBefore);
            assert.deepEqual(instance.db.stmts.findPostAuthorsByPostId.all(post.dbId), postAuthorsBefore);

            const [reloaded] = await instance.getAllPosts();
            assert.deepEqual(
                reloaded.data.tags.map((tag: TagContext) => tag.data.slug),
                ['first-tag', 'second-tag']
            );
            assert.deepEqual(
                reloaded.data.authors.map((author: AuthorContext) => author.data.slug),
                ['first-author', 'second-author']
            );
            assert.deepEqual(
                instance.sanitizedFields.map(field => [field.field, field.reason]),
                [
                    ['title', 'trimmed'],
                    ['feature_image', 'replaced']
                ]
            );

            instance.updatePostData(post.dbId, {status: 'published'});
            const rowWithoutScraperUpdate = instance.db.stmts.findPostById.get(post.dbId) as any;
            assert.deepEqual(JSON.parse(rowWithoutScraperUpdate.webscrape_data), {
                featureImage: 'downloaded.jpg'
            });

            instance.updatePostData(post.dbId, {}, {webscrapeData: undefined});
            const rowWithClearedScraperData = instance.db.stmts.findPostById.get(post.dbId) as any;
            assert.equal(rowWithClearedScraperData.webscrape_data, null);

            await instance.close();
        });

        it('Rejects invalid patches, relationship fields, slugs, and unknown posts', async () => {
            const instance = new MigrateContext();
            await instance.init();

            assert.throws(() => instance.updatePostData(1, null as any), {
                name: 'BadRequestError',
                message: 'Post data patch must be an object.'
            });
            assert.throws(() => instance.updatePostData(1, [] as any), {
                name: 'BadRequestError',
                message: 'Post data patch must be an object.'
            });
            assert.throws(() => instance.updatePostData(1, {tags: []} as any), {
                name: 'BadRequestError',
                message: 'Post data patch cannot update "tags". Use PostContext.save() instead.'
            });
            assert.throws(() => instance.updatePostData(1, {slug: 'replacement'} as any), {
                name: 'BadRequestError',
                message: 'Post data patch cannot update "slug". Use PostContext.save() instead.'
            });
            assert.throws(() => instance.updatePostData(999, {title: 'Missing'}), {
                name: 'NotFoundError',
                message: 'Post with database ID 999 was not found.'
            });

            await instance.close();
        });
    });

    it('Can add existing PostContext to list of posts', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = new PostContext();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        await instance.addPost(post1);

        const post2 = new PostContext();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        await instance.addPost(post2);

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts.length, 2);
        assert.equal(allPosts[0].data.title, 'Test Post');
        assert.equal(allPosts[1].data.title, 'Another Post');

        await instance.close();
    });

    it('Can loop over posts async', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = await instance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        await post1.save(instance.db);

        const post2 = await instance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        await post2.save(instance.db);

        await instance.forEachPost(async (post: PostContext) => {
            post.set('status', 'published');
        });

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts.length, 2);
        assert.equal(allPosts[0].data.status, 'published');
        assert.equal(allPosts[1].data.status, 'published');

        await instance.close();
    });

    it('Can loop over posts with progress option', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = await instance.addPost();
        post1.set('title', 'Post A');
        post1.set('slug', 'post-a');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        await post1.save(instance.db);

        const post2 = await instance.addPost();
        post2.set('title', 'Post B');
        post2.set('slug', 'post-b');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        await post2.save(instance.db);

        const progressCalls: [number, number][] = [];
        instance.on('progress', ({processed, total}: {processed: number; total: number}) => {
            progressCalls.push([processed, total]);
        });

        await instance.forEachPost(
            async (post: PostContext) => {
                post.set('status', 'published');
            },
            {batchSize: 1}
        );

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts[0].data.status, 'published');
        assert.equal(allPosts[1].data.status, 'published');
        assert.deepEqual(progressCalls, [
            [1, 2],
            [2, 2]
        ]);

        await instance.close();
    });

    it('Bounds unfiltered post iteration to the rows present when it starts', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        for (let i = 1; i <= 3; i += 1) {
            const post = await instance.addPost();
            post.set('title', `Original ${i}`);
            post.set('slug', `original-${i}`);
            await post.save(instance.db);
        }

        const titles: string[] = [];
        const progressCalls: [number, number][] = [];
        instance.on('progress', ({operation, processed, total}: any) => {
            if (operation === 'forEachPost') {
                progressCalls.push([processed, total]);
            }
        });

        await instance.forEachPost(
            async (post: PostContext) => {
                titles.push(post.data.title);
                if (titles.length === 1) {
                    const added = await instance.addPost();
                    added.set('title', 'Added during iteration');
                    added.set('slug', 'added-during-iteration');
                    await added.save(instance.db);
                }
            },
            {batchSize: 1}
        );

        assert.deepEqual(titles, ['Original 1', 'Original 2', 'Original 3']);
        assert.deepEqual(progressCalls, [
            [1, 3],
            [2, 3],
            [3, 3]
        ]);
        assert.equal((await instance.getAllPosts()).length, 4);

        await instance.close();
    });

    describe('findPosts', () => {
        let reusedInstance: any;

        before(async () => {
            reusedInstance = new MigrateContext();
            await reusedInstance.init();

            const reusedPost1 = await reusedInstance.addPost({
                source: {
                    url: 'https://example.com/blog/2023/11/26/test-post/'
                }
            });
            reusedPost1.set('title', 'Test Post');
            reusedPost1.set('slug', 'test-post');
            reusedPost1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            reusedPost1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
            reusedPost1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
            reusedPost1.addTag({name: 'Test Tag', slug: 'test-tag'});
            reusedPost1.addTag({name: 'First Tag', slug: 'first-tag'});
            reusedPost1.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            reusedPost1.addAuthor({name: 'First Author', slug: 'first-author', email: 'first@example.com'});
            await reusedPost1.save(reusedInstance.db);

            const reusedPost2 = await reusedInstance.addPost({
                source: {
                    url: 'https://example.com/blog/2023/11/26/another-post/'
                }
            });
            reusedPost2.set('title', 'Another Post');
            reusedPost2.set('slug', 'another-post');
            reusedPost2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            reusedPost2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
            reusedPost2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
            reusedPost2.addTag({name: 'Test Tag', slug: 'test-tag'});
            reusedPost2.addTag({name: 'Second Tag', slug: 'second-tag'});
            reusedPost2.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            reusedPost2.addAuthor({name: 'Second Author', slug: 'second-author', email: 'second@example.com'});
            await reusedPost2.save(reusedInstance.db);
        });

        after(async () => {
            await reusedInstance.close();
        });

        it('Can find posts by slug', async () => {
            const foundPosts = await reusedInstance.findPosts({
                slug: 'another-post'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by title', async () => {
            const foundPosts = await reusedInstance.findPosts({
                title: 'Another Post'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by source', async () => {
            const foundPosts = await reusedInstance.findPosts({
                sourceAttr: {
                    key: 'url',
                    value: 'https://example.com/blog/2023/11/26/test-post/'
                }
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Test Post');
        });

        it('Can find posts by tag slug', async () => {
            const foundPosts = await reusedInstance.findPosts({
                tagSlug: 'second-tag'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by tag name', async () => {
            const foundPosts = await reusedInstance.findPosts({
                tagName: 'Second Tag'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by author slug', async () => {
            const foundPosts = await reusedInstance.findPosts({
                authorSlug: 'second-author'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by author name', async () => {
            const foundPosts = await reusedInstance.findPosts({
                authorName: 'Second Author'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by author email', async () => {
            const foundPosts = await reusedInstance.findPosts({
                authorEmail: 'second@example.com'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Returns null if no filter provided', async () => {
            const foundPosts = await reusedInstance.findPosts({});

            assert.equal(foundPosts, null);
        });

        it('Returns empty array for non-existent tag slug', async () => {
            const found = await reusedInstance.findPosts({tagSlug: 'nonexistent-tag'});
            assert.deepEqual(found, []);
        });

        it('Returns empty array for non-existent author slug', async () => {
            const found = await reusedInstance.findPosts({authorSlug: 'nonexistent-author'});
            assert.deepEqual(found, []);
        });

        it('Returns empty array for non-existent author email', async () => {
            const found = await reusedInstance.findPosts({authorEmail: 'nonexistent@example.com'});
            assert.deepEqual(found, []);
        });
    });

    describe('findTags', () => {
        let reusedInstance: any;

        before(async () => {
            reusedInstance = new MigrateContext();
            await reusedInstance.init();

            const post1 = await reusedInstance.addPost();
            post1.set('title', 'Test Post');
            post1.set('slug', 'test-post');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addTag({name: 'Test Tag', slug: 'test-tag'});
            post1.addTag({name: 'First Tag', slug: 'first-tag'});
            await post1.save(reusedInstance.db);

            const post2 = await reusedInstance.addPost();
            post2.set('title', 'Another Post');
            post2.set('slug', 'another-post');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addTag({name: 'Test Tag', slug: 'test-tag'});
            post2.addTag({name: 'Second Tag', slug: 'second-tag'});
            await post2.save(reusedInstance.db);
        });

        after(async () => {
            await reusedInstance.close();
        });

        it('Can find tags by slug', async () => {
            const foundTags = await reusedInstance.findTags({
                slug: 'second-tag'
            });

            assert.equal(foundTags.length, 1);
            assert.equal(foundTags[0].data.name, 'Second Tag');
        });

        it('Can find tags by name', async () => {
            const foundTags = await reusedInstance.findTags({
                name: 'Second Tag'
            });

            assert.equal(foundTags.length, 1);
            assert.equal(foundTags[0].data.name, 'Second Tag');
        });

        it('Returns null if no filter provided', async () => {
            const foundTags = await reusedInstance.findTags({});

            assert.equal(foundTags, null);
        });
    });

    describe('forEachTag', () => {
        it('Iterates and saves all used tags', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Post');
            post.set('slug', 'post');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.addTag({name: 'Alpha', slug: 'alpha'});
            post.addTag({name: 'Beta', slug: 'beta'});
            await post.save(instance.db);

            const slugs: string[] = [];
            await instance.forEachTag(
                async (tag: any) => {
                    slugs.push(tag.data.slug);
                    tag.set('description', `Desc for ${tag.data.slug}`);
                },
                {batchSize: 1}
            );

            assert.deepEqual(slugs, ['alpha', 'beta']);

            // Verify saves persisted
            const tags = await instance.findTags({slug: 'alpha'});
            assert.equal(tags![0].data.description, 'Desc for alpha');

            await instance.close();
        });
    });

    describe('forEachAuthor', () => {
        it('Iterates and saves all used authors', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Post');
            post.set('slug', 'post');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            post.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com'});
            await post.save(instance.db);

            const slugs: string[] = [];
            await instance.forEachAuthor(
                async (author: any) => {
                    slugs.push(author.data.slug);
                    author.set('bio', 'Updated bio');
                },
                {batchSize: 1}
            );

            assert.deepEqual(slugs, ['alice', 'bob']);

            // Verify saves persisted
            const authors = await instance.findAuthors({slug: 'alice'});
            assert.equal(authors![0].data.bio, 'Updated bio');

            await instance.close();
        });
    });

    describe('findAuthors', () => {
        let reusedInstance: any;

        before(async () => {
            reusedInstance = new MigrateContext();
            await reusedInstance.init();

            const post1 = await reusedInstance.addPost();
            post1.set('title', 'Test Post');
            post1.set('slug', 'test-post');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            post1.addAuthor({name: 'First Author', slug: 'first-author', email: 'first@example.com'});
            await post1.save(reusedInstance.db);

            const post2 = await reusedInstance.addPost();
            post2.set('title', 'Another Post');
            post2.set('slug', 'another-post');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            post2.addAuthor({name: 'Second Author', slug: 'second-author', email: 'second@example.com'});
            await post2.save(reusedInstance.db);
        });

        after(async () => {
            await reusedInstance.close();
        });

        it('Can find authors by slug', async () => {
            const foundAuthors = await reusedInstance.findAuthors({
                slug: 'second-author'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        it('Can find authors by name', async () => {
            const foundAuthors = await reusedInstance.findAuthors({
                name: 'Second Author'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        it('Can find authors by email', async () => {
            const foundAuthors = await reusedInstance.findAuthors({
                email: 'second@example.com'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        it('Returns null if no filter provided', async () => {
            const foundTags = await reusedInstance.findAuthors({});

            assert.equal(foundTags, null);
        });
    });

    describe('tag and author scope', () => {
        it('Uses referenced by default and applies all consistently across find, iterate, stream, and export', async () => {
            const instance = new MigrateContext({storage: 'memory'});
            await instance.init();

            const post: any = await instance.addPost();
            post.set('title', 'Scoped post');
            post.set('slug', 'scoped-post');
            post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            post.addTag({name: 'Used tag', slug: 'used-tag'});
            post.addAuthor({name: 'Used author', slug: 'used-author', email: 'used@example.com'});
            post.save(instance.db);

            new TagContext({name: 'Orphan tag', slug: 'orphan-tag'}).save(instance.db);
            new AuthorContext({
                name: 'Orphan author',
                slug: 'orphan-author',
                email: 'orphan@example.com'
            }).save(instance.db);

            assert.deepEqual(await instance.findTags({slug: 'orphan-tag'}), []);
            assert.equal((await instance.findTags({slug: 'orphan-tag', scope: 'all'}))![0].data.name, 'Orphan tag');
            assert.deepEqual(await instance.findAuthors({slug: 'orphan-author'}), []);
            assert.equal(
                (await instance.findAuthors({slug: 'orphan-author', scope: 'all'}))![0].data.name,
                'Orphan author'
            );

            const referencedTags: string[] = [];
            await instance.forEachTag(async tag => {
                referencedTags.push(tag.data.slug);
            });
            assert.deepEqual(referencedTags, ['used-tag']);

            const allTags: string[] = [];
            await instance.forEachTag(
                async tag => {
                    allTags.push(tag.data.slug);
                },
                {scope: 'all'}
            );
            assert.deepEqual(allTags, ['used-tag', 'orphan-tag']);

            const allStreamedTags: string[] = [];
            for await (const tag of instance.streamTags({scope: 'all'})) {
                allStreamedTags.push(tag.data.slug);
            }
            assert.deepEqual(allStreamedTags, ['used-tag', 'orphan-tag']);

            const referencedAuthors: string[] = [];
            for await (const author of instance.streamAuthors()) {
                referencedAuthors.push(author.data.slug);
            }
            assert.deepEqual(referencedAuthors, ['used-author']);

            const allAuthors: string[] = [];
            for await (const author of instance.streamAuthors({scope: 'all'})) {
                allAuthors.push(author.data.slug);
            }
            assert.deepEqual(allAuthors, ['used-author', 'orphan-author']);

            const allIteratedAuthors: string[] = [];
            await instance.forEachAuthor(
                async author => {
                    allIteratedAuthors.push(author.data.slug);
                },
                {scope: 'all'}
            );
            assert.deepEqual(allIteratedAuthors, ['used-author', 'orphan-author']);

            const directory = join(tmpdir(), `mg-context-scope-${Date.now()}`);
            const referencedTagFile = await instance.writeGhostTagsJson(directory, {filename: 'referenced-tags'});
            const referencedTagsJson = JSON.parse(await readFile(referencedTagFile.path, 'utf8'));
            const allTagFile = await instance.writeGhostTagsJson(directory, {filename: 'all-tags', scope: 'all'});
            const referencedUserFile = await instance.writeGhostUsersJson(directory, {filename: 'referenced-users'});
            const referencedUsersJson = JSON.parse(await readFile(referencedUserFile.path, 'utf8'));
            const allUserFile = await instance.writeGhostUsersJson(directory, {filename: 'all-users', scope: 'all'});

            assert.equal(referencedTagsJson.data.tags.length, 1);
            assert.equal(JSON.parse(await readFile(allTagFile.path, 'utf8')).data.tags.length, 2);
            assert.equal(referencedUsersJson.data.users.length, 1);
            assert.equal(JSON.parse(await readFile(allUserFile.path, 'utf8')).data.users.length, 2);
            await assert.rejects(readFile(referencedTagFile.path), {code: 'ENOENT'});
            await assert.rejects(readFile(referencedUserFile.path), {code: 'ENOENT'});

            await rm(directory, {recursive: true, force: true});
            await instance.close();
        });
    });

    describe('addLink / findLink', () => {
        it('Stores and retrieves links', async () => {
            const instance = new MigrateContext();
            await instance.init();

            instance.addLink('example.com/my-post/', '/my-post/');
            instance.addLink('example.com/other-post/', '/other-post/');

            assert.equal(instance.findLink('example.com/my-post/'), '/my-post/');
            assert.equal(instance.findLink('example.com/other-post/'), '/other-post/');

            await instance.close();
        });

        it('Ignores duplicate old_url entries', async () => {
            const instance = new MigrateContext();
            await instance.init();

            instance.addLink('example.com/my-post/', '/my-post/');
            instance.addLink('example.com/my-post/', '/different-path/');

            assert.equal(instance.findLink('example.com/my-post/'), '/my-post/');

            await instance.close();
        });

        it('Returns null when no match exists', async () => {
            const instance = new MigrateContext();
            await instance.init();

            assert.equal(instance.findLink('example.com/missing/'), null);

            await instance.close();
        });

        it('Finds a single link by old_url', async () => {
            const instance = new MigrateContext();
            await instance.init();

            instance.addLink('example.com/my-post/', '/my-post/');
            instance.addLink('example.com/other-post/', '/other-post/');

            assert.equal(instance.findLink('example.com/my-post/'), '/my-post/');
            assert.equal(instance.findLink('example.com/other-post/'), '/other-post/');
            assert.equal(instance.findLink('example.com/missing/'), null);

            await instance.close();
        });
    });

    describe('forEachGhostPost', () => {
        it('Iterates all posts with valid Ghost JSON', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Ghost Post 1');
            post1.set('slug', 'ghost-post-1');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addTag({name: 'Tag A', slug: 'tag-a'});
            post1.addAuthor({name: 'Author A', slug: 'author-a', email: 'a@example.com'});
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Ghost Post 2');
            post2.set('slug', 'ghost-post-2');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addTag({name: 'Tag B', slug: 'tag-b'});
            post2.addAuthor({name: 'Author B', slug: 'author-b', email: 'b@example.com'});
            await post2.save(instance.db);

            const collected: {json: any; post: PostContext}[] = [];

            await instance.forEachGhostPost(async (json: any, post: PostContext) => {
                collected.push({json, post});
            });

            assert.equal(collected.length, 2);

            // Each call receives a flat post object with tags and authors inline
            for (const {json} of collected) {
                assert.ok(json.title);
                assert.ok(json.slug);
                assert.ok(Array.isArray(json.tags));
                assert.ok(Array.isArray(json.authors));
            }

            // Correct post data
            assert.equal(collected[0].json.title, 'Ghost Post 1');
            assert.equal(collected[1].json.title, 'Ghost Post 2');

            // Tags and authors are flat objects (no data wrapper)
            assert.equal(collected[0].json.tags[0].slug, 'tag-a');
            assert.equal(collected[0].json.authors[0].email, 'a@example.com');

            // PostContext is also passed
            assert.equal(collected[0].post.data.title, 'Ghost Post 1');
            assert.equal(collected[1].post.data.title, 'Ghost Post 2');

            await instance.close();
        });

        it('Fires progress callback', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            for (let i = 1; i <= 3; i++) {
                const post = await instance.addPost();
                post.set('title', `Progress Post ${i}`);
                post.set('slug', `progress-post-${i}`);
                post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
                await post.save(instance.db);
            }

            const progressCalls: [number, number][] = [];
            instance.on('progress', ({processed, total}: {processed: number; total: number}) => {
                progressCalls.push([processed, total]);
            });

            await instance.forEachGhostPost(async () => {}, {batchSize: 2});

            assert.deepEqual(progressCalls, [
                [2, 3],
                [3, 3]
            ]);

            await instance.close();
        });

        it('Does not persist callback mutations', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Original Title');
            post.set('slug', 'original-title');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            await instance.forEachGhostPost(async (_json: any, p: PostContext) => {
                p.set('title', 'Mutated Title');
            });

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts[0].data.title, 'Original Title');

            await instance.close();
        });
    });

    it('Can return Ghost JSON', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = await instance.addPost({
            source: {url: 'https://example.com/blog/2023/11/26/test-post/'}
        });
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('meta_title', 'SEO Title');
        post1.addTag({name: 'Test Tag', slug: 'test-tag'});
        post1.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
        await post1.save(instance.db);

        const post2 = await instance.addPost({
            source: {url: 'https://example.com/blog/2023/11/26/another-post/'}
        });
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.addTag({name: 'Test Tag', slug: 'test-tag'});
        post2.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
        await post2.save(instance.db);

        const writtenFiles = await instance.writeGhostJson(tmpdir());

        assert.equal(writtenFiles.length, 1);
        assert.equal(writtenFiles[0].posts, 2);
        assert.ok(writtenFiles[0].size > 0);
        assert.equal(writtenFiles[0].name, 'posts.json');
        const ghostJSON = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));

        assert.deepEqual(Object.keys(ghostJSON), ['meta', 'data']);
        assert.deepEqual(Object.keys(ghostJSON.data), [
            'posts',
            'users',
            'tags',
            'posts_authors',
            'posts_tags',
            'posts_meta'
        ]);
        assert.deepEqual(ghostJSON.data.posts.length, 2);
        assert.equal(ghostJSON.data.posts_meta.length, 1);
        assert.equal(ghostJSON.data.posts_meta[0].meta_title, 'SEO Title');

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    it('Exports sort_order in posts_tags and posts_authors', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post = await instance.addPost();
        post.set('title', 'Sort Order Test');
        post.set('slug', 'sort-order-test');
        post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post.addTag({name: 'Tag A', slug: 'tag-a'});
        post.addTag({name: 'Tag B', slug: 'tag-b'});
        post.addTag({name: 'Tag C', slug: 'tag-c'});
        post.addAuthor({name: 'Author A', slug: 'author-a', email: 'a@example.com'});
        post.addAuthor({name: 'Author B', slug: 'author-b', email: 'b@example.com'});
        await post.save(instance.db);

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'sort-order-test'});
        const ghostJSON = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));

        assert.equal(ghostJSON.data.posts_tags.length, 3);
        assert.equal(ghostJSON.data.posts_tags[0].sort_order, 1);
        assert.equal(ghostJSON.data.posts_tags[1].sort_order, 2);
        assert.equal(ghostJSON.data.posts_tags[2].sort_order, 3);

        assert.equal(ghostJSON.data.posts_authors.length, 2);
        assert.equal(ghostJSON.data.posts_authors[0].sort_order, 1);
        assert.equal(ghostJSON.data.posts_authors[1].sort_order, 2);

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    it('Preserves sort_order after reordering tags', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post = await instance.addPost();
        post.set('title', 'Reorder Test');
        post.set('slug', 'reorder-test');
        post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post.addTag({name: 'Alpha', slug: 'alpha'});
        post.addTag({name: 'Beta', slug: 'beta'});
        post.addTag({name: 'Gamma', slug: 'gamma'});
        post.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
        await post.save(instance.db);

        // Reload and reorder
        const posts = await instance.getAllPosts();
        const loaded = posts[0];
        loaded.setPrimaryTag({name: 'Gamma', slug: 'gamma'});
        loaded.save(instance.db);

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'reorder-test'});
        const ghostJSON = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));

        // Gamma should now be sort_order 1 (primary)
        const gammaTag = ghostJSON.data.tags.find((t: any) => t.slug === 'gamma');
        const gammaJoin = ghostJSON.data.posts_tags.find((pt: any) => pt.tag_id === gammaTag.id);
        assert.equal(gammaJoin.sort_order, 1);

        // Alpha should now be sort_order 2
        const alphaTag = ghostJSON.data.tags.find((t: any) => t.slug === 'alpha');
        const alphaJoin = ghostJSON.data.posts_tags.find((pt: any) => pt.tag_id === alphaTag.id);
        assert.equal(alphaJoin.sort_order, 2);

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    it('Can write Ghost JSON to file', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post = await instance.addPost();
        post.set('title', 'File Test Post');
        post.set('slug', 'file-test-post');
        post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
        await post.save(instance.db);

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'file-test'});

        assert.equal(writtenFiles.length, 1);
        assert.equal(writtenFiles[0].name, 'file-test.json');
        const fileContent = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));
        assert.deepEqual(Object.keys(fileContent), ['meta', 'data']);
        assert.deepEqual(fileContent.data.posts.length, 1);

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    it('Emits export:file-written after each completed file', async () => {
        const instance = new MigrateContext({storage: 'memory'});
        await instance.init();

        const post = await instance.addPost();
        post.set('title', 'Event export');
        post.set('slug', 'event-export');
        post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
        post.save(instance.db);

        const events: WrittenFile[] = [];
        instance.on('export:file-written', event => events.push(event));
        const directory = join(tmpdir(), `mg-context-export-event-${Date.now()}`);
        const files = await instance.writeGhostJson(directory);

        assert.deepEqual(events, files);

        await rm(directory, {recursive: true, force: true});
        await instance.close();
    });

    it('Can write batched Ghost JSON files', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        // Create 3 posts with different tags/authors
        for (let i = 1; i <= 3; i++) {
            const post = await instance.addPost();
            post.set('title', `Batch Post ${i}`);
            post.set('slug', `batch-post-${i}`);
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.addTag({name: 'Shared Tag', slug: 'shared-tag'});
            post.addTag({name: `Tag ${i}`, slug: `tag-${i}`});
            post.addAuthor({name: 'Shared Author', slug: 'shared-author', email: 'shared@example.com'});
            await post.save(instance.db);
        }

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {batchSize: 2, filename: 'batch-test'});

        assert.equal(writtenFiles.length, 2);
        assert.equal(writtenFiles[0].name, 'batch-test-1.json');
        assert.equal(writtenFiles[1].name, 'batch-test-2.json');
        assert.equal(writtenFiles[0].posts, 2);
        assert.equal(writtenFiles[1].posts, 1);

        const batch1 = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));
        const batch2 = JSON.parse(await readFile(writtenFiles[1].path, 'utf-8'));

        // Batch 1 has 2 posts, batch 2 has 1 post
        assert.equal(batch1.data.posts.length, 2);
        assert.equal(batch2.data.posts.length, 1);

        // Each batch includes the tags for its posts
        assert.ok(batch1.data.tags.length >= 2);
        assert.ok(batch2.data.tags.length >= 1);

        // Shared tag appears in both batches with the same ID
        const batch1SharedTag = batch1.data.tags.find((t: any) => t.slug === 'shared-tag');
        const batch2SharedTag = batch2.data.tags.find((t: any) => t.slug === 'shared-tag');
        assert.ok(batch1SharedTag);
        assert.ok(batch2SharedTag);
        assert.equal(batch1SharedTag.id, batch2SharedTag.id);

        // Shared author appears in both batches with the same ID
        const batch1SharedAuthor = batch1.data.users.find((u: any) => u.slug === 'shared-author');
        const batch2SharedAuthor = batch2.data.users.find((u: any) => u.slug === 'shared-author');
        assert.ok(batch1SharedAuthor);
        assert.ok(batch2SharedAuthor);
        assert.equal(batch1SharedAuthor.id, batch2SharedAuthor.id);

        for (const f of writtenFiles) {
            await unlink(f.path);
        }
        await instance.close();
    });

    it('Automatically removes only stale files owned by the previous export manifest', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        for (let i = 1; i <= 4; i += 1) {
            const post = await instance.addPost();
            post.set('title', `Manifest Post ${i}`);
            post.set('slug', `manifest-post-${i}`);
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);
        }

        const dir = join(tmpdir(), `mg-context-manifest-test-${Date.now()}`);
        const first = await instance.writeGhostJson(dir, {batchSize: 1, filename: 'manifest-test'});
        assert.deepEqual(
            first.map((file: WrittenFile) => file.name),
            ['manifest-test-1.json', 'manifest-test-2.json', 'manifest-test-3.json', 'manifest-test-4.json']
        );

        const unrelatedPath = join(dir, 'manifest-test-not-generated.json');
        await writeFile(unrelatedPath, 'not created by mg-context');

        const withoutCleanup = await instance.writeGhostJson(dir, {batchSize: 2, filename: 'manifest-test'});
        assert.deepEqual(
            withoutCleanup.map((file: WrittenFile) => file.name),
            ['manifest-test-1.json', 'manifest-test-2.json']
        );
        await assert.rejects(readFile(first[2].path), {code: 'ENOENT'});
        await assert.rejects(readFile(first[3].path), {code: 'ENOENT'});

        const second = await instance.writeGhostJson(dir, {
            batchSize: 2,
            filename: 'manifest-test',
            replaceExisting: true
        });
        assert.deepEqual(
            second.map((file: WrittenFile) => file.name),
            ['manifest-test-1.json', 'manifest-test-2.json']
        );
        await assert.rejects(readFile(first[2].path), {code: 'ENOENT'});
        await assert.rejects(readFile(first[3].path), {code: 'ENOENT'});
        assert.equal(await readFile(unrelatedPath, 'utf8'), 'not created by mg-context');

        const third = await instance.writeGhostJson(dir, {
            batchSize: 10,
            filename: 'manifest-test',
            replaceExisting: true
        });
        assert.deepEqual(
            third.map((file: WrittenFile) => file.name),
            ['manifest-test.json']
        );
        await assert.rejects(readFile(second[0].path), {code: 'ENOENT'});
        await assert.rejects(readFile(second[1].path), {code: 'ENOENT'});
        assert.equal(await readFile(unrelatedPath, 'utf8'), 'not created by mg-context');

        const fourth = await instance.writeGhostJson(dir, {
            batchSize: 2,
            filename: 'manifest-test',
            replaceExisting: true
        });
        assert.deepEqual(
            fourth.map((file: WrittenFile) => file.name),
            ['manifest-test-1.json', 'manifest-test-2.json']
        );
        await assert.rejects(readFile(third[0].path), {code: 'ENOENT'});
        assert.equal(await readFile(unrelatedPath, 'utf8'), 'not created by mg-context');

        const renamed = await instance.writeGhostJson(dir, {batchSize: 10, filename: 'renamed-export'});
        assert.equal(renamed[0].name, 'renamed-export.json');
        await assert.rejects(readFile(fourth[0].path), {code: 'ENOENT'});
        await assert.rejects(readFile(fourth[1].path), {code: 'ENOENT'});
        assert.equal(await readFile(unrelatedPath, 'utf8'), 'not created by mg-context');

        await rm(dir, {recursive: true, force: true});
        await instance.close();
    });

    it('Keeps the previous manifest and output set when generation is interrupted', async () => {
        const instance = new MigrateContext({storage: 'memory'});
        await instance.init();

        for (let i = 1; i <= 2; i += 1) {
            const post = await instance.addPost();
            post.set('title', `Interrupted Post ${i}`);
            post.set('slug', `interrupted-post-${i}`);
            post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            post.save(instance.db);
        }

        const directory = join(tmpdir(), `mg-context-interrupted-export-${Date.now()}`);
        const previous = await instance.writeGhostJson(directory, {batchSize: 1, filename: 'previous'});
        const manifestPath = join(directory, '.mg-context-export-manifest.json');
        const previousManifest = await readFile(manifestPath, 'utf8');
        const originalToGhostPost = PostContext.toGhostPost;
        let calls = 0;
        const converter = mock.method(PostContext, 'toGhostPost', (row: any) => {
            calls += 1;
            if (calls === 2) {
                throw new Error('interrupted export');
            }
            return originalToGhostPost(row);
        });

        await assert.rejects(() => instance.writeGhostJson(directory, {batchSize: 1, filename: 'interrupted'}), {
            message: 'interrupted export'
        });
        converter.mock.restore();

        assert.equal(await readFile(manifestPath, 'utf8'), previousManifest);
        await readFile(previous[0].path);
        await readFile(previous[1].path);
        await assert.rejects(readFile(join(directory, 'interrupted-1.json')), {code: 'ENOENT'});
        await assert.rejects(readFile(join(directory, 'interrupted-2.json')), {code: 'ENOENT'});

        await rm(directory, {recursive: true, force: true});
        await instance.close();
    });

    it('Rejects invalid export filenames', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        for (const filename of ['.json', 'nested/export', 'nested\\export']) {
            await assert.rejects(() => instance.writeGhostJson(tmpdir(), {filename}), {
                name: 'BadRequestError',
                message: 'Ghost JSON filename must be a non-empty base filename without path separators.'
            });
            await assert.rejects(() => instance.writeGhostTagsJson(tmpdir(), {filename}), {
                name: 'BadRequestError',
                message: 'Ghost JSON filename must be a non-empty base filename without path separators.'
            });
            await assert.rejects(() => instance.writeGhostUsersJson(tmpdir(), {filename}), {
                name: 'BadRequestError',
                message: 'Ghost JSON filename must be a non-empty base filename without path separators.'
            });
        }

        await instance.close();
    });

    it('Refuses to clean output when the ownership manifest is invalid', async () => {
        const instance = new MigrateContext({storage: 'memory'});
        await instance.init();
        const directory = join(tmpdir(), `mg-context-invalid-manifest-${Date.now()}`);
        await mkdir(directory, {recursive: true});
        for (const invalid of [
            {version: 99},
            {version: 1},
            {version: 1, exports: 'invalid'},
            {version: 1, exports: []},
            {version: 1, exports: {posts: 'invalid'}},
            {version: 1, exports: {posts: [1]}},
            {version: 1, exports: {posts: ['x']}},
            {version: 1, exports: {posts: ['posts.txt']}},
            {version: 1, exports: {posts: ['../posts.json']}},
            {version: 1, exports: {posts: ['nested\\posts.json']}}
        ]) {
            await writeFile(join(directory, '.mg-context-export-manifest.json'), JSON.stringify(invalid));
            await assert.rejects(() => instance.writeGhostJson(directory), {
                name: 'InternalServerError',
                message: 'Could not read .mg-context-export-manifest.json. Remove or repair it before exporting again.'
            });
        }

        await rm(directory, {recursive: true, force: true});
        await instance.close();
    });

    it('Strips .json extension from filename option', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'export.json'});

        assert.equal(writtenFiles.length, 1);
        assert.equal(writtenFiles[0].name, 'export.json');
        assert.ok(!writtenFiles[0].name.includes('.json.json'));

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    it('Creates output directory if it does not exist', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const topDir = join(tmpdir(), `mg-context-mkdir-test-${Date.now()}`);
        const nestedDir = join(topDir, 'sub', 'dir');
        const writtenFiles = await instance.writeGhostJson(nestedDir);

        assert.equal(writtenFiles.length, 1);
        assert.ok(writtenFiles[0].path.startsWith(nestedDir));

        await rm(topDir, {recursive: true});
        await instance.close();
    });

    it('Can write Ghost JSON with empty context', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'empty-test'});

        assert.equal(writtenFiles.length, 1);
        assert.equal(writtenFiles[0].posts, 0);
        assert.equal(writtenFiles[0].name, 'empty-test.json');
        const content = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));
        assert.deepEqual(Object.keys(content), ['meta', 'data']);
        assert.equal(content.data.posts.length, 0);

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    describe('Ghost JSON content', () => {
        it('Exports HTML only', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'HTML Only Post');
            post.set('slug', 'html-only-post');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.set('html', '<p>Hello world</p>');
            post.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            await post.save(instance.db);

            const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'html-test'});
            const ghostJSON = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));

            assert.equal(ghostJSON.data.posts.length, 1);
            assert.equal(ghostJSON.data.posts[0].html, '<p>Hello world</p>');

            await unlink(writtenFiles[0].path);
            await instance.close();
        });
    });

    describe('Standalone save', () => {
        it('Can update a tag with existing dbId', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Tag Update Test');
            post.set('slug', 'tag-update-test');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.addTag({name: 'Original Name', slug: 'update-tag'});
            await post.save(instance.db);

            // Load the tag from DB, modify it, and save again (covers dbId UPDATE branch)
            const tags = await instance.findTags({slug: 'update-tag'});
            assert.equal(tags!.length, 1);
            tags![0].set('name', 'Updated Name');
            await tags![0].save(instance.db);

            const updatedTags = await instance.findTags({slug: 'update-tag'});
            assert.equal(updatedTags![0].data.name, 'Updated Name');

            await instance.close();
        });

        it('Can update an author with existing dbId', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Author Update Test');
            post.set('slug', 'author-update-test');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.addAuthor({name: 'Original Author', slug: 'update-author', email: 'update@example.com'});
            await post.save(instance.db);

            // Load the author from DB, modify it, and save again (covers dbId UPDATE branch)
            const authors = await instance.findAuthors({slug: 'update-author'});
            assert.equal(authors!.length, 1);
            authors![0].set('name', 'Updated Author');
            await authors![0].save(instance.db);

            const updatedAuthors = await instance.findAuthors({slug: 'update-author'});
            assert.equal(updatedAuthors![0].data.name, 'Updated Author');

            await instance.close();
        });

        it('Can save a tag without a slug', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const tag = new TagContext({name: 'No Slug Tag'});
            await tag.save(instance.db);
            assert.ok(tag.dbId);

            await instance.close();
        });

        it('Can save an author without a slug', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const author = new AuthorContext({name: 'No Slug Author'});
            await author.save(instance.db);
            assert.ok(author.dbId);

            await instance.close();
        });
    });

    describe('Post lookup_key deduplication', () => {
        it('Silently skips insert when lookup_key already exists', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post1.set('title', 'First Post');
            post1.set('slug', 'first-post');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post2.set('title', 'Duplicate Post');
            post2.set('slug', 'duplicate-post');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.title, 'First Post');
            assert.equal(post2.dbId, post1.dbId);

            await instance.close();
        });

        it('Replaces transformed content from an earlier run when onDuplicate is replace', async () => {
            const filePath = join(tmpdir(), `mg-context-lookup-replace-${Date.now()}.sqlite`);

            const firstRun: any = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await firstRun.init();

            const original = await firstRun.addPost({
                lookupKey: 'https://example.com/refresh-me',
                sourceContent: '<p>Original source</p>',
                source: {parser: 'old'},
                meta: {transform: 'old'}
            });
            original.set('title', 'Old title');
            original.set('slug', 'old-slug');
            original.set('html', '<p>Old shortcode output</p>');
            original.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            original.addTag({name: 'Old Tag', slug: 'old-tag'});
            original.addAuthor({name: 'Old Author', slug: 'old-author', email: 'old@example.com'});
            await original.save(firstRun.db);
            await firstRun.prepareForExport();

            const originalDbId = original.dbId;
            const originalGhostId = original.ghostId;
            await firstRun.close();

            const secondRun: any = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                onDuplicate: 'replace',
                mapSourcePost: post => {
                    post.set('title', 'Old title');
                    post.set('slug', 'old-slug');
                    post.set('html', post.sourceContent);
                    post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
                }
            });
            await secondRun.init();

            const replacement = await secondRun.addPost({
                lookupKey: 'https://example.com/refresh-me',
                sourceContent: '<p>New source</p>',
                source: {parser: 'new'},
                meta: {transform: 'new'}
            });
            replacement.set('title', 'New title');
            replacement.set('slug', 'new-slug');
            replacement.set('html', '<p>Fresh transformed content</p>');
            replacement.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            replacement.addTag({name: 'New Tag', slug: 'new-tag'});
            replacement.addAuthor({name: 'New Author', slug: 'new-author', email: 'new@example.com'});
            await replacement.save(secondRun.db);
            await secondRun.prepareForExport();

            const allPosts = await secondRun.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(replacement.dbId, originalDbId);
            assert.equal(replacement.ghostId, originalGhostId);
            assert.equal(allPosts[0].data.title, 'New title');
            assert.equal(allPosts[0].data.slug, 'new-slug');
            assert.equal(allPosts[0].data.html, '<p>Fresh transformed content</p>');
            assert.equal(allPosts[0].getSourceValue('parser'), 'new');
            assert.equal(allPosts[0].getMetaValue('transform'), 'new');
            assert.deepEqual(
                allPosts[0].data.tags.map((tag: TagContext) => tag.data.slug),
                ['new-tag']
            );
            assert.deepEqual(
                allPosts[0].data.authors.map((author: AuthorContext) => author.data.slug),
                ['new-author']
            );

            await secondRun.close();
            await unlink(filePath);
        });

        it('Allows a per-post replace policy to override the context default', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const original = await instance.addPost({lookupKey: 'https://example.com/per-post-replace'});
            original.set('title', 'Old title');
            original.set('slug', 'old-slug');
            original.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await original.save(instance.db);

            const replacement = await instance.addPost({
                lookupKey: 'https://example.com/per-post-replace',
                onDuplicate: 'replace'
            });
            replacement.set('title', 'New title');
            replacement.set('slug', 'new-slug');
            replacement.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await replacement.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.title, 'New title');

            await instance.close();
        });

        it('Uses a duplicate resolver to keep the most recently updated source revision', async () => {
            const decisions: string[] = [];
            const instance: any = new MigrateContext({
                onDuplicate: (existing: PostContext, incoming: PostContext) => {
                    decisions.push(`${existing.get('title')} -> ${incoming.get('title')}`);
                    const existingUpdatedAt = existing.get('updated_at') as Date | null;
                    const incomingUpdatedAt = incoming.get('updated_at') as Date | null;
                    if (incomingUpdatedAt && (!existingUpdatedAt || incomingUpdatedAt > existingUpdatedAt)) {
                        return 'replace';
                    }
                    return 'skip';
                }
            });
            await instance.init();

            const first = await instance.addPost({lookupKey: 'wordpress-post-900'});
            first.set('title', 'Middle revision');
            first.set('slug', 'post-900');
            first.set('created_at', new Date('2026-10-02T10:00:00.000Z'));
            first.set('updated_at', new Date('2026-10-04T10:00:00.000Z'));
            await first.save(instance.db);

            const older = await instance.addPost({lookupKey: 'wordpress-post-900'});
            older.set('title', 'Older revision');
            older.set('slug', 'post-900');
            older.set('created_at', new Date('2026-10-02T10:00:00.000Z'));
            older.set('updated_at', new Date('2026-10-03T09:00:00.000Z'));
            await older.save(instance.db);

            let posts = await instance.getAllPosts();
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Middle revision');

            const newest = await instance.addPost({lookupKey: 'wordpress-post-900'});
            newest.set('title', 'Newest revision');
            newest.set('slug', 'post-900');
            newest.set('created_at', new Date('2026-10-02T10:00:00.000Z'));
            newest.set('updated_at', new Date('2026-10-05T12:30:00.000Z'));
            await newest.save(instance.db);

            posts = await instance.getAllPosts();
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Newest revision');
            assert.deepEqual(posts[0].data.updated_at, new Date('2026-10-05T12:30:00.000Z'));
            assert.equal(older.dbId, first.dbId);
            assert.equal(newest.dbId, first.dbId);
            assert.deepEqual(decisions, ['Middle revision -> Older revision', 'Middle revision -> Newest revision']);

            await instance.close();
        });

        it('Rejects an invalid duplicate resolver result', async () => {
            const instance: any = new MigrateContext({
                onDuplicate: (() => 'merge') as any
            });
            await instance.init();

            const original = await instance.addPost({lookupKey: 'invalid-resolver-result'});
            original.set('title', 'Original');
            original.set('slug', 'original');
            original.set('created_at', new Date('2026-10-02T10:00:00.000Z'));
            await original.save(instance.db);

            const duplicate = await instance.addPost({lookupKey: 'invalid-resolver-result'});
            duplicate.set('title', 'Duplicate');
            duplicate.set('slug', 'duplicate');
            duplicate.set('created_at', new Date('2026-10-03T10:00:00.000Z'));

            assert.throws(() => duplicate.save(instance.db), {
                name: 'InternalServerError',
                message: 'Duplicate post resolver must return "skip" or "replace".'
            });
            assert.equal(duplicate.dbId, null);
            assert.equal(duplicate.ghostId, null);

            const posts = await instance.getAllPosts();
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Original');

            await instance.close();
        });

        it('Deduplicates a replacement slug owned by another post', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const original = await instance.addPost({lookupKey: 'https://example.com/replaced-post'});
            original.set('title', 'Original');
            original.set('slug', 'original-slug');
            original.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await original.save(instance.db);

            const retained = await instance.addPost({lookupKey: 'https://example.com/retained-post'});
            retained.set('title', 'Retained');
            retained.set('slug', 'refreshed-slug');
            retained.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await retained.save(instance.db);

            const replacement = await instance.addPost({
                lookupKey: 'https://example.com/replaced-post',
                onDuplicate: 'replace'
            });
            replacement.set('title', 'Replacement');
            replacement.set('slug', 'refreshed-slug');
            replacement.set('created_at', new Date('2023-11-25T12:00:00.000Z'));
            await replacement.save(instance.db);

            assert.equal(replacement.data.slug, 'refreshed-slug-2');
            assert.deepEqual(instance.db.slugRenames, [
                {
                    oldSlug: 'refreshed-slug',
                    newSlug: 'refreshed-slug-2',
                    url: ''
                }
            ]);

            const row = instance.db.db
                .prepare('SELECT slug, original_slug FROM Posts WHERE id = ?')
                .get(replacement.dbId) as any;
            assert.equal(row.slug, 'refreshed-slug-2');
            assert.equal(row.original_slug, 'refreshed-slug');

            const duplicates = await instance.deduplicateSlugs();
            assert.deepEqual(duplicates, [
                {oldSlug: 'refreshed-slug', newSlug: 'refreshed-slug', url: ''},
                {oldSlug: 'refreshed-slug', newSlug: 'refreshed-slug-2', url: ''}
            ]);

            await instance.close();
        });

        it('Applies the context duplicate policy to a pre-built PostContext', async () => {
            const instance: any = new MigrateContext({onDuplicate: 'replace'});
            await instance.init();

            const original = await instance.addPost({lookupKey: 'https://example.com/pre-built-replace'});
            original.set('title', 'Old title');
            original.set('slug', 'old-slug');
            original.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await original.save(instance.db);

            const replacement = new PostContext({lookupKey: 'https://example.com/pre-built-replace'});
            replacement.set('title', 'New title');
            replacement.set('slug', 'new-slug');
            replacement.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await instance.addPost(replacement);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.title, 'New title');

            await instance.close();
        });

        it('Does not record a slug rename for a post skipped by lookup_key', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post1.set('title', 'First Post');
            post1.set('slug', 'same-slug');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post2.set('title', 'Duplicate Post');
            post2.set('slug', 'same-slug');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            // The skipped post never claimed a slug, so no rename was recorded
            assert.equal(instance.db.slugRenames.length, 0);
            // ...and it still holds the slug it was given
            assert.equal(post2.data.slug, 'same-slug');

            const duplicates = await instance.deduplicateSlugs();
            assert.equal(duplicates.length, 0);

            await instance.close();
        });

        it('Still deduplicates slugs across posts with different lookup_keys', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post1.set('title', 'First Post');
            post1.set('slug', 'same-slug');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/post-2'});
            post2.set('title', 'Second Post');
            post2.set('slug', 'same-slug');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            assert.equal(instance.db.slugRenames.length, 1);
            assert.equal(post2.data.slug, 'same-slug-2');

            await instance.close();
        });

        it('Posts without lookup_key always insert normally', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Post A');
            post1.set('slug', 'post-a');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Post B');
            post2.set('slug', 'post-b');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 2);

            await instance.close();
        });

        it('Different lookup_keys create separate posts', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post1.set('title', 'Post 1');
            post1.set('slug', 'post-1');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/post-2'});
            post2.set('title', 'Post 2');
            post2.set('slug', 'post-2');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 2);
            assert.notEqual(post1.dbId, post2.dbId);

            await instance.close();
        });

        it('Can get and set lookupKey, onDuplicate and warnOnLookupKeyDuplicate on PostContext', () => {
            const post = new PostContext({lookupKey: 'https://example.com/initial'});
            assert.equal(post.lookupKey, 'https://example.com/initial');
            assert.equal(post.onDuplicate, 'skip');
            assert.equal(post.warnOnLookupKeyDuplicate, false);

            post.lookupKey = 'https://example.com/updated';
            assert.equal(post.lookupKey, 'https://example.com/updated');

            post.onDuplicate = 'replace';
            assert.equal(post.onDuplicate, 'replace');

            post.warnOnLookupKeyDuplicate = true;
            assert.equal(post.warnOnLookupKeyDuplicate, true);
        });

        it('lookup_key round-trips through save/load', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost({lookupKey: 'https://example.com/round-trip'});
            post.set('title', 'Round Trip Key');
            post.set('slug', 'round-trip-key');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            const loaded = await instance.getAllPosts();
            assert.equal(loaded.length, 1);
            assert.equal(loaded[0].lookupKey, 'https://example.com/round-trip');

            await instance.close();
        });

        it('No warning logged when warnOnLookupKeyDuplicate is false', async () => {
            const warnMock = mock.method(console, 'warn', () => {});

            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/no-warn'});
            post1.set('title', 'First');
            post1.set('slug', 'first');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/no-warn'});
            post2.set('title', 'Duplicate');
            post2.set('slug', 'duplicate');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            assert.equal(warnMock.mock.calls.length, 0);

            warnMock.mock.restore();
            await instance.close();
        });

        it('Deprecated warning option does not log and the skip is reported', async () => {
            const warnMock = mock.method(console, 'warn', () => {});

            const instance: any = new MigrateContext({warnOnLookupKeyDuplicate: true});
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/warn-me'});
            post1.set('title', 'First');
            post1.set('slug', 'first');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/warn-me'});
            post2.set('title', 'Duplicate');
            post2.set('slug', 'duplicate');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            assert.equal(warnMock.mock.calls.length, 0);
            assert.equal(instance.getMigrationReport().summary['post:skipped'], 1);

            warnMock.mock.restore();
            await instance.close();
        });

        it('Duplicate skip does not modify existing post tags/authors', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/tags-test'});
            post1.set('title', 'Original');
            post1.set('slug', 'original');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addTag({name: 'Original Tag', slug: 'original-tag'});
            post1.addAuthor({name: 'Original Author', slug: 'original-author', email: 'orig@example.com'});
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/tags-test'});
            post2.set('title', 'Duplicate');
            post2.set('slug', 'duplicate');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addTag({name: 'New Tag', slug: 'new-tag'});
            post2.addAuthor({name: 'New Author', slug: 'new-author', email: 'new@example.com'});
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.tags.length, 1);
            assert.equal(allPosts[0].data.tags[0].data.slug, 'original-tag');
            assert.equal(allPosts[0].data.authors.length, 1);
            assert.equal(allPosts[0].data.authors[0].data.slug, 'original-author');

            await instance.close();
        });

        it('lookup_key persists on update', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost({lookupKey: 'https://example.com/update-key'});
            post.set('title', 'Before Update');
            post.set('slug', 'update-key');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            post.set('title', 'After Update');
            await post.save(instance.db);

            const loaded = await instance.getAllPosts();
            assert.equal(loaded.length, 1);
            assert.equal(loaded[0].data.title, 'After Update');
            assert.equal(loaded[0].lookupKey, 'https://example.com/update-key');

            await instance.close();
        });
    });

    describe('transaction', () => {
        it('Wraps operations in a single transaction', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            await instance.transaction(async () => {
                const post = await instance.addPost();
                post.set('title', 'Transaction Post');
                post.set('slug', 'txn-post');
                post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
                post.addTag({name: 'Txn Tag', slug: 'txn-tag'});
                post.addAuthor({name: 'Txn Author', slug: 'txn-author', email: 'txn@example.com'});
                await post.save(instance.db);
            });

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.title, 'Transaction Post');
            assert.equal(allPosts[0].data.tags.length, 1);
            assert.equal(allPosts[0].data.authors.length, 1);

            await instance.close();
        });

        it('Rolls back on error', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            await assert.rejects(
                async () => {
                    await instance.transaction(async () => {
                        const post = await instance.addPost();
                        post.set('title', 'Will Rollback');
                        post.set('slug', 'will-rollback');
                        post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
                        await post.save(instance.db);
                        throw new errors.InternalServerError({message: 'forced rollback'});
                    });
                },
                {message: 'forced rollback', name: 'InternalServerError'}
            );

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 0);

            await instance.close();
        });

        it('withTransaction rolls back on sync error', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Before Rollback');
            post.set('slug', 'before-rollback');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            assert.throws(
                () => {
                    withTransaction(instance.db, () => {
                        instance.db.stmts.updatePost.run(
                            JSON.stringify({title: 'Rolled Back', slug: 'before-rollback'}),
                            '{}',
                            '{}',
                            null,
                            post.ghostId,
                            '2023-11-23T00:00:00.000Z',
                            null,
                            null,
                            'before-rollback',
                            null,
                            post.dbId
                        );
                        throw new errors.InternalServerError({message: 'sync rollback'});
                    });
                },
                {message: 'sync rollback'}
            );

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts[0].data.title, 'Before Rollback');

            await instance.close();
        });

        it('withTransaction is a no-op wrapper when already in a transaction', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Nested TX');
            post.set('slug', 'nested-tx');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            // Outer transaction via ctx.transaction, inner via withTransaction
            await instance.transaction(async () => {
                withTransaction(instance.db, () => {
                    instance.db.stmts.updatePost.run(
                        JSON.stringify({title: 'Updated In Nested', slug: 'nested-tx'}),
                        null,
                        '{}',
                        '{}',
                        null,
                        post.ghostId,
                        '2023-11-23T00:00:00.000Z',
                        null,
                        null,
                        'nested-tx',
                        null,
                        post.dbId
                    );
                });
            });

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts[0].data.title, 'Updated In Nested');

            await instance.close();
        });
    });

    describe('nested transaction', () => {
        it('ctx.transaction() passes through when already in a transaction', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Outer TX');
            post.set('slug', 'outer-tx');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            await instance.transaction(async () => {
                // Nested transaction should not issue BEGIN
                await instance.transaction(async () => {
                    const posts = await instance.getAllPosts();
                    posts[0].set('title', 'Nested Update');
                    await posts[0].save(instance.db);
                });
            });

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts[0].data.title, 'Nested Update');

            await instance.close();
        });
    });

    describe('findPostsByIds', () => {
        it('Returns empty array for empty ID list', async () => {
            const instance: any = new MigrateContext();
            await instance.init();
            const result = findPostsByIds(instance.db, []);
            assert.deepEqual(result, []);
            await instance.close();
        });
    });

    describe('init guard', () => {
        it('Throws when init() is called twice without close()', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            await assert.rejects(() => instance.init(), {
                message: 'MigrateContext is already initialized. Call close() before reinitializing.'
            });

            await instance.close();
        });
    });

    describe('Cache bypass paths', () => {
        it('Tag existing.update branch when slug exists in DB but not cache', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            // Insert tag directly into DB, bypassing the cache
            instance.db.stmts.insertTag.run(
                JSON.stringify({name: 'Pre-existing', slug: 'pre-tag'}),
                'pre-tag',
                'Pre-existing',
                null
            );

            // Save a TagContext with the same slug — should hit the existing.update branch
            const tag = new TagContext({name: 'Updated Pre-existing', slug: 'pre-tag'});
            await tag.save(instance.db);

            assert.ok(tag.dbId);
            const found = await instance.findTags({slug: 'pre-tag', scope: 'all'});
            assert.equal(found!.length, 1);
            assert.equal(found![0].data.name, 'Updated Pre-existing');

            await instance.close();
        });

        it('Author existing.update branch when slug exists in DB but not cache', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            // Insert author directly into DB, bypassing the cache
            instance.db.stmts.insertAuthor.run(
                JSON.stringify({name: 'Pre-existing', slug: 'pre-author', email: 'pre@example.com'}),
                'pre-author',
                'Pre-existing',
                'pre@example.com',
                null
            );

            // Save an AuthorContext with the same slug — should hit the existing.update branch
            const author = new AuthorContext({
                name: 'Updated Pre-existing',
                slug: 'pre-author',
                email: 'pre@example.com'
            });
            await author.save(instance.db);

            assert.ok(author.dbId);
            const found = await instance.findAuthors({slug: 'pre-author', scope: 'all'});
            assert.equal(found!.length, 1);
            assert.equal(found![0].data.name, 'Updated Pre-existing');

            await instance.close();
        });
    });

    describe('Duplicate skip guard', () => {
        it('Second save on a duplicate-skipped post is a no-op', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/dup-guard'});
            post1.set('title', 'Original');
            post1.set('slug', 'original');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/dup-guard'});
            post2.set('title', 'Duplicate');
            post2.set('slug', 'duplicate');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db); // Sets duplicateSkipped = true

            // Call save again — should hit the #duplicateSkipped guard and return early
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.title, 'Original');

            await instance.close();
        });
    });

    describe('DB round-trip', () => {
        it('Preserves post data through save and load', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Round Trip');
            post.set('slug', 'round-trip');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
            post.set('published_at', new Date('2023-11-25T12:00:00.000Z'));
            post.set('status', 'published');
            post.set('featured', true);
            post.set('html', '<p>Content</p>');
            post.addTag({name: 'Tag One', slug: 'tag-one'});
            post.addTag({name: 'Tag Two', slug: 'tag-two'});
            post.addAuthor({name: 'Author One', slug: 'author-one', email: 'one@example.com'});
            await post.save(instance.db);

            const loaded = await instance.getAllPosts();
            assert.equal(loaded.length, 1);
            const p = loaded[0];
            assert.equal(p.data.title, 'Round Trip');
            assert.equal(p.data.slug, 'round-trip');
            assert.equal(p.data.status, 'published');
            assert.equal(p.data.featured, true);
            assert.equal(p.data.html, '<p>Content</p>');
            assert.deepEqual(p.data.created_at, new Date('2023-11-23T12:00:00.000Z'));
            assert.deepEqual(p.data.updated_at, new Date('2023-11-24T12:00:00.000Z'));
            assert.deepEqual(p.data.published_at, new Date('2023-11-25T12:00:00.000Z'));
            assert.equal(p.data.tags.length, 2);
            assert.equal(p.data.tags[0].data.name, 'Tag One');
            assert.equal(p.data.tags[1].data.name, 'Tag Two');
            assert.equal(p.data.authors.length, 1);
            assert.equal(p.data.authors[0].data.name, 'Author One');

            await instance.close();
        });

        it('Preserves webscrape_data through save and load', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Scraped Post');
            post.set('slug', 'scraped-post');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.webscrapeData = {meta_title: 'Scraped Title', og_image: 'https://example.com/img.jpg'};
            await post.save(instance.db);

            const loaded = await instance.getAllPosts();
            assert.equal(loaded.length, 1);
            assert.deepEqual(loaded[0].webscrapeData, {
                meta_title: 'Scraped Title',
                og_image: 'https://example.com/img.jpg'
            });

            await instance.close();
        });

        it('webscrape_data defaults to null', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'No Scrape');
            post.set('slug', 'no-scrape');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            const loaded = await instance.getAllPosts();
            assert.equal(loaded[0].webscrapeData, null);

            await instance.close();
        });

        it('Tags are shared across posts', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Post 1');
            post1.set('slug', 'post-1');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addTag({name: 'Shared Tag', slug: 'shared-tag'});
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Post 2');
            post2.set('slug', 'post-2');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addTag({name: 'Shared Tag', slug: 'shared-tag'});
            await post2.save(instance.db);

            // Both posts should reference the same tag in the DB
            const tags = await instance.findTags({slug: 'shared-tag'});
            assert.equal(tags.length, 1);

            await instance.close();
        });

        it('Mutable find results persist back to DB', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Original Title');
            post.set('slug', 'mutable-test');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.addTag({name: 'News', slug: 'news'});
            await post.save(instance.db);

            const posts = await instance.findPosts({tagSlug: 'news'});
            assert.equal(posts!.length, 1);
            posts![0].addTag({name: 'Breaking', slug: 'breaking'});
            await posts![0].save(instance.db);

            const updated = await instance.findPosts({slug: 'mutable-test'});
            assert.equal(updated![0].data.tags.length, 2);
            assert.equal(updated![0].data.tags[1].data.slug, 'breaking');

            await instance.close();
        });
    });

    describe('Export preparation', () => {
        it('Runs automatically before writing Ghost JSON', async () => {
            const instance = new MigrateContext({storage: 'memory'});
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Original');
            post.set('slug', 'automatic-preparation');
            post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            post.save(instance.db);

            const row = instance.db.stmts.findPostById.get(post.dbId) as any;
            const data = JSON.parse(row.data);
            data.title = '   ';
            instance.db.stmts.updatePostData.run(JSON.stringify(data), post.dbId);

            const directory = join(tmpdir(), `mg-context-automatic-preparation-${Date.now()}`);
            const files = await instance.writeGhostJson(directory);
            const output = JSON.parse(await readFile(files[0].path, 'utf8'));
            assert.equal(output.data.posts[0].title, '(Untitled)');
            assert.equal(instance.getMigrationReport().summary['field:sanitized'], 1);

            await rm(directory, {recursive: true, force: true});
            await instance.close();
        });

        it('Backfills blank titles already stored in SQLite', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Original');
            post.set('slug', 'untitled');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await post.save(instance.db);

            const row = instance.db.stmts.findPostById.get(post.dbId) as any;
            const data = JSON.parse(row.data);
            data.title = '   ';
            instance.db.stmts.updatePostData.run(JSON.stringify(data), post.dbId);

            await instance.prepareForExport();

            const updated = instance.db.stmts.findPostById.get(post.dbId) as any;
            assert.equal(JSON.parse(updated.data).title, '(Untitled)');

            await instance.close();
        });

        it('Reports an empty slug when preparing a legacy malformed row', async () => {
            const instance = new MigrateContext({storage: 'memory'});
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Original');
            post.set('slug', 'legacy-malformed');
            post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            post.save(instance.db);

            const row = instance.db.stmts.findPostById.get(post.dbId) as any;
            const data = JSON.parse(row.data);
            data.title = '';
            delete data.slug;
            instance.db.stmts.updatePostData.run(JSON.stringify(data), post.dbId);

            await instance.prepareForExport();
            assert.equal(instance.sanitizedFields.at(-1)!.slug, '');

            await instance.close();
        });

        it('Rolls back preparation and clears queued events when a stored row is invalid', async () => {
            const instance = new MigrateContext({storage: 'memory'});
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Invalid row');
            post.set('slug', 'invalid-row');
            post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            post.save(instance.db);
            instance.db.stmts.updatePostData.run('{not json', post.dbId);

            await assert.rejects(() => instance.prepareForExport(), SyntaxError);
            assert.equal(instance.db.inTransaction, false);
            assert.equal(instance.db.pendingEvents.length, 0);

            await instance.close();
        });

        it('Reports progress during preparation', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            for (let i = 0; i < 3; i += 1) {
                const post = await instance.addPost();
                post.set('title', `Post ${i}`);
                post.set('slug', `post-${i}`);
                post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
                post.set('html', `<p>Content ${i}</p>`);
                await post.save(instance.db);
            }

            const calls: [number, number][] = [];
            instance.on('progress', ({processed, total}: {processed: number; total: number}) => {
                calls.push([processed, total]);
            });

            await instance.prepareForExport();

            assert.ok(calls.length > 0);
            const last = calls[calls.length - 1];
            assert.equal(last[0], 3);
            assert.equal(last[1], 3);

            await instance.close();
        });

        it('Can remove progress listener with off', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Off Test');
            post.set('slug', 'off-test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');
            await post.save(instance.db);

            const calls: number[] = [];
            const listener = ({processed}: {processed: number}) => {
                calls.push(processed);
            };
            instance.on('progress', listener);
            instance.off('progress', listener);

            await instance.prepareForExport();
            assert.equal(calls.length, 0);

            await instance.close();
        });

        it('emitEvents: false suppresses all progress events', async () => {
            const instance: any = new MigrateContext({emitEvents: false});
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Silent');
            post.set('slug', 'silent');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');
            await post.save(instance.db);

            const calls: any[] = [];
            instance.on('progress', (...args: any[]) => {
                calls.push(args);
            });

            await instance.prepareForExport();
            await instance.forEachPost(async () => {});

            assert.equal(calls.length, 0);

            await instance.close();
        });

        it('Deduplicates slugs at insert time and reports via prepareForExport', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'First');
            post1.set('slug', 'same');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post1.set('published_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Second');
            post2.set('slug', 'same');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            // Slug was already deduped at insert time
            assert.equal(post2.data.slug, 'same-2');

            await instance.prepareForExport();

            assert.equal(instance.duplicateSlugs.length, 2);
            assert.equal(instance.duplicateSlugs[0].newSlug, 'same');
            assert.equal(instance.duplicateSlugs[1].newSlug, 'same-2');

            await instance.close();
        });
    });

    describe('PostFilter', () => {
        let ctx: any;

        // 5 posts:
        // A: tag=news, author=alice, created=2023-01-15, published=2023-02-01
        // B: tag=news, author=bob,   created=2023-03-15, published=2023-04-01
        // C: tag=tech, author=alice,  created=2023-06-15, published=2023-07-01
        // D: tag=tech, author=bob,    created=2023-09-15, published=null (draft)
        // E: no tag,   author=alice,  created=2023-12-15, published=2023-12-20

        before(async () => {
            ctx = new MigrateContext();
            await ctx.init();

            const postA = await ctx.addPost();
            postA.set('title', 'Post A');
            postA.set('slug', 'post-a');
            postA.set('created_at', new Date('2023-01-15T00:00:00.000Z'));
            postA.set('published_at', new Date('2023-02-01T00:00:00.000Z'));
            postA.set('status', 'published');
            postA.addTag({name: 'News', slug: 'news'});
            postA.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            await postA.save(ctx.db);

            const postB = await ctx.addPost();
            postB.set('title', 'Post B');
            postB.set('slug', 'post-b');
            postB.set('created_at', new Date('2023-03-15T00:00:00.000Z'));
            postB.set('published_at', new Date('2023-04-01T00:00:00.000Z'));
            postB.set('status', 'published');
            postB.addTag({name: 'News', slug: 'news'});
            postB.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com'});
            await postB.save(ctx.db);

            const postC = await ctx.addPost();
            postC.set('title', 'Post C');
            postC.set('slug', 'post-c');
            postC.set('created_at', new Date('2023-06-15T00:00:00.000Z'));
            postC.set('published_at', new Date('2023-07-01T00:00:00.000Z'));
            postC.set('status', 'published');
            postC.addTag({name: 'Tech', slug: 'tech'});
            postC.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            await postC.save(ctx.db);

            const postD = await ctx.addPost();
            postD.set('title', 'Post D');
            postD.set('slug', 'post-d');
            postD.set('created_at', new Date('2023-09-15T00:00:00.000Z'));
            postD.addTag({name: 'Tech', slug: 'tech'});
            postD.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com'});
            await postD.save(ctx.db);

            const postE = await ctx.addPost();
            postE.set('title', 'Post E');
            postE.set('slug', 'post-e');
            postE.set('created_at', new Date('2023-12-15T00:00:00.000Z'));
            postE.set('published_at', new Date('2023-12-20T00:00:00.000Z'));
            postE.set('status', 'published');
            postE.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            await postE.save(ctx.db);
        });

        after(async () => {
            await ctx.close();
        });

        async function collectTitles(filter: PostFilter): Promise<string[]> {
            const titles: string[] = [];
            await ctx.forEachPost(
                async (post: PostContext) => {
                    titles.push(post.data.title);
                },
                {filter}
            );
            return titles;
        }

        describe('forEachPost', () => {
            it('No filter returns all 5 posts', async () => {
                const titles = await collectTitles({});
                assert.equal(titles.length, 5);
            });

            it('Snapshots matches before callbacks mutate the filtered field', async () => {
                const filtered: any = new MigrateContext();
                await filtered.init();

                for (let i = 1; i <= 2; i += 1) {
                    const post = await filtered.addPost();
                    post.set('title', `Filtered ${i}`);
                    post.set('slug', `filtered-${i}`);
                    post.set('created_at', new Date(`2023-01-0${i}T00:00:00.000Z`));
                    await post.save(filtered.db);
                }

                const titles: string[] = [];
                await filtered.forEachPost(
                    async (post: PostContext) => {
                        titles.push(post.data.title);
                        post.set('created_at', new Date('2025-01-01T00:00:00.000Z'));
                    },
                    {
                        batchSize: 1,
                        filter: {createdAt: {before: new Date('2024-01-01T00:00:00.000Z')}}
                    }
                );

                assert.deepEqual(titles, ['Filtered 1', 'Filtered 2']);
                await filtered.close();
            });

            it('Tag slug filter returns matching posts', async () => {
                const titles = await collectTitles({tag: {slug: 'news'}});
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('Author slug filter returns matching posts', async () => {
                const titles = await collectTitles({tag: {slug: 'news'}, author: {slug: 'alice'}});
                assert.deepEqual(titles, ['Post A']);
            });

            it('Author slug filter alone returns matching posts', async () => {
                const titles = await collectTitles({author: {slug: 'alice'}});
                assert.deepEqual(titles, ['Post A', 'Post C', 'Post E']);
            });

            it('createdAt after filter', async () => {
                const titles = await collectTitles({createdAt: {after: new Date('2023-06-01T00:00:00.000Z')}});
                assert.deepEqual(titles, ['Post C', 'Post D', 'Post E']);
            });

            it('createdAt before filter (strict)', async () => {
                const titles = await collectTitles({createdAt: {before: new Date('2023-03-15T00:00:00.000Z')}});
                assert.deepEqual(titles, ['Post A']);
            });

            it('createdAt onOrBefore filter (inclusive)', async () => {
                const titles = await collectTitles({createdAt: {onOrBefore: new Date('2023-03-15T00:00:00.000Z')}});
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('createdAt onOrAfter filter (inclusive)', async () => {
                const titles = await collectTitles({createdAt: {onOrAfter: new Date('2023-06-15T00:00:00.000Z')}});
                assert.deepEqual(titles, ['Post C', 'Post D', 'Post E']);
            });

            it('publishedAt range excludes drafts', async () => {
                const titles = await collectTitles({
                    publishedAt: {
                        after: new Date('2023-01-01T00:00:00.000Z'),
                        before: new Date('2023-05-01T00:00:00.000Z')
                    }
                });
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('Combined tag + date filter', async () => {
                const titles = await collectTitles({
                    tag: {slug: 'news'},
                    createdAt: {after: new Date('2023-02-01T00:00:00.000Z')}
                });
                assert.deepEqual(titles, ['Post B']);
            });

            it('Combined tag + author filter', async () => {
                const titles = await collectTitles({tag: {slug: 'news'}, author: {slug: 'alice'}});
                assert.deepEqual(titles, ['Post A']);
            });

            it('Tag name filter returns matching posts', async () => {
                const titles = await collectTitles({tag: {name: 'Tech'}});
                assert.deepEqual(titles, ['Post C', 'Post D']);
            });

            it('Author name filter returns matching posts', async () => {
                const titles = await collectTitles({author: {name: 'Bob'}});
                assert.deepEqual(titles, ['Post B', 'Post D']);
            });

            it('Author email filter returns matching posts', async () => {
                const titles = await collectTitles({author: {email: 'bob@example.com'}});
                assert.deepEqual(titles, ['Post B', 'Post D']);
            });

            it('publishedAt after excludes earlier posts', async () => {
                const titles = await collectTitles({
                    publishedAt: {after: new Date('2023-06-01T00:00:00.000Z')}
                });
                // A (Feb), B (Apr) excluded by after; D excluded by null; C (Jul) and E (Dec) pass
                assert.deepEqual(titles, ['Post C', 'Post E']);
            });

            it('publishedAt onOrAfter includes boundary', async () => {
                const titles = await collectTitles({
                    publishedAt: {onOrAfter: new Date('2023-07-01T00:00:00.000Z')}
                });
                // C (Jul 01) included at boundary; D excluded by null; E (Dec 20) included
                assert.deepEqual(titles, ['Post C', 'Post E']);
            });

            it('publishedAt onOrBefore includes boundary', async () => {
                const titles = await collectTitles({
                    publishedAt: {onOrBefore: new Date('2023-04-01T00:00:00.000Z')}
                });
                // A (Feb 01), B (Apr 01) included; D excluded by null
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('Non-matching filter returns 0 posts', async () => {
                const titles = await collectTitles({tag: {slug: 'nonexistent'}});
                assert.equal(titles.length, 0);
            });

            it('Progress reports correct filtered total', async () => {
                const progressCalls: [number, number][] = [];
                ctx.on('progress', ({processed, total}: {processed: number; total: number}) => {
                    progressCalls.push([processed, total]);
                });
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachPost(async (_post: PostContext) => {}, {
                    filter: {tag: {slug: 'news'}}
                });
                assert.ok(progressCalls.length > 0);
                const lastCall = progressCalls[progressCalls.length - 1];
                assert.equal(lastCall[0], 2);
                assert.equal(lastCall[1], 2);
            });

            it('forEachPost on empty context processes zero posts', async () => {
                const empty: any = new MigrateContext();
                await empty.init();
                let count = 0;
                await empty.forEachPost(async () => {
                    count += 1;
                });
                assert.equal(count, 0);
                await empty.close();
            });
        });

        describe('streamPosts', () => {
            it('yields all posts as PostContext objects', async () => {
                const titles: string[] = [];
                for await (const post of ctx.streamPosts({batchSize: 1})) {
                    titles.push(post.data.title);
                }
                assert.equal(titles.length, 5);
            });

            it('does not yield posts added after unfiltered streaming starts', async () => {
                const streamed: any = new MigrateContext();
                await streamed.init();

                for (let i = 1; i <= 2; i += 1) {
                    const post = await streamed.addPost();
                    post.set('title', `Streamed ${i}`);
                    post.set('slug', `streamed-${i}`);
                    await post.save(streamed.db);
                }

                const titles: string[] = [];
                for await (const post of streamed.streamPosts({batchSize: 1})) {
                    titles.push(post.data.title);
                    if (titles.length === 1) {
                        const added = await streamed.addPost();
                        added.set('title', 'Added during stream');
                        added.set('slug', 'added-during-stream');
                        await added.save(streamed.db);
                    }
                }

                assert.deepEqual(titles, ['Streamed 1', 'Streamed 2']);
                await streamed.close();
            });

            it('supports filter option', async () => {
                const titles: string[] = [];
                for await (const post of ctx.streamPosts({filter: {tag: {slug: 'news'}}})) {
                    titles.push(post.data.title);
                }
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('snapshots matches before consumers persist filtered-field changes', async () => {
                const filtered: any = new MigrateContext();
                await filtered.init();

                for (let i = 1; i <= 2; i += 1) {
                    const post = await filtered.addPost();
                    post.set('title', `Stream filter ${i}`);
                    post.set('slug', `stream-filter-${i}`);
                    post.set('created_at', new Date(`2023-02-0${i}T00:00:00.000Z`));
                    await post.save(filtered.db);
                }

                const titles: string[] = [];
                for await (const post of filtered.streamPosts({
                    batchSize: 1,
                    filter: {createdAt: {before: new Date('2024-01-01T00:00:00.000Z')}}
                })) {
                    titles.push(post.data.title);
                    post.set('created_at', new Date('2025-01-01T00:00:00.000Z'));
                    await post.save(filtered.db);
                }

                assert.deepEqual(titles, ['Stream filter 1', 'Stream filter 2']);
                await filtered.close();
            });

            it('yields zero posts on empty context', async () => {
                const empty: any = new MigrateContext();
                await empty.init();
                let count = 0;
                for await (const _post of empty.streamPosts()) {
                    // eslint-disable-line no-unused-vars
                    count += 1;
                }
                assert.equal(count, 0);
                await empty.close();
            });
        });

        describe('streamTags', () => {
            it('yields all used tags', async () => {
                const slugs: string[] = [];
                for await (const tag of ctx.streamTags({batchSize: 1})) {
                    slugs.push(tag.data.slug);
                }
                assert.ok(slugs.includes('news'));
                assert.ok(slugs.includes('tech'));
            });
        });

        describe('streamAuthors', () => {
            it('yields all used authors', async () => {
                const slugs: string[] = [];
                for await (const author of ctx.streamAuthors({batchSize: 1})) {
                    slugs.push(author.data.slug);
                }
                assert.ok(slugs.includes('alice'));
                assert.ok(slugs.includes('bob'));
            });
        });

        describe('forEachGhostPost', () => {
            it('Tag filter works read-only', async () => {
                const titles: string[] = [];
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachGhostPost(
                    async (json: any, _post: PostContext) => {
                        titles.push(json.title);
                    },
                    {filter: {tag: {slug: 'tech'}}}
                );
                assert.deepEqual(titles, ['Post C', 'Post D']);
            });

            it('Tag filter with progress reports correct total', async () => {
                const progressCalls: [number, number][] = [];
                ctx.on('progress', ({processed, total}: {processed: number; total: number}) => {
                    progressCalls.push([processed, total]);
                });
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachGhostPost(async (_json: any, _post: PostContext) => {}, {
                    filter: {tag: {slug: 'news'}}
                });
                assert.ok(progressCalls.length > 0);
                const lastCall = progressCalls[progressCalls.length - 1];
                assert.equal(lastCall[0], 2);
                assert.equal(lastCall[1], 2);
            });

            it('Date-only filter works without tag/author', async () => {
                const titles: string[] = [];
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachGhostPost(
                    async (json: any, _post: PostContext) => {
                        titles.push(json.title);
                    },
                    {filter: {createdAt: {after: new Date('2023-09-01T00:00:00.000Z')}}}
                );
                assert.deepEqual(titles, ['Post D', 'Post E']);
            });

            it('Tag + date filter skips date-excluded posts', async () => {
                const titles: string[] = [];
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachGhostPost(
                    async (json: any, _post: PostContext) => {
                        titles.push(json.title);
                    },
                    {filter: {tag: {slug: 'tech'}, createdAt: {after: new Date('2023-08-01T00:00:00.000Z')}}}
                );
                assert.deepEqual(titles, ['Post D']);
            });
        });

        describe('writeGhostJson', () => {
            it('Tag filter outputs only matching posts', async () => {
                const dir = join(tmpdir(), `mg-filter-write-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {filter: {tag: {slug: 'news'}}});
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 2);

                const content = JSON.parse(await readFile(files[0].path, 'utf-8'));
                const postTitles = content.data.posts.map((p: any) => p.title);
                assert.deepEqual(postTitles, ['Post A', 'Post B']);

                await rm(dir, {recursive: true, force: true});
            });

            it('onWrite callback fires for each file', async () => {
                const dir = join(tmpdir(), `mg-filter-onwrite-${Date.now()}`);
                const written: any[] = [];
                const files = await ctx.writeGhostJson(dir, {
                    filter: {tag: {slug: 'news'}},
                    batchSize: 1,
                    onWrite(f: any) {
                        written.push(f);
                    }
                });
                assert.equal(written.length, 2);
                assert.deepEqual(written, files);

                await rm(dir, {recursive: true, force: true});
            });

            it('Batched output with filter produces correct file count', async () => {
                const dir = join(tmpdir(), `mg-filter-batch-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {filter: {tag: {slug: 'news'}}, batchSize: 1});
                assert.equal(files.length, 2);
                assert.equal(files[0].posts, 1);
                assert.equal(files[1].posts, 1);

                await rm(dir, {recursive: true, force: true});
            });

            it('Tag + date filter outputs only matching posts', async () => {
                const dir = join(tmpdir(), `mg-filter-tagdate-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    filter: {tag: {slug: 'news'}, createdAt: {after: new Date('2023-02-01T00:00:00.000Z')}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 1);

                const content = JSON.parse(await readFile(files[0].path, 'utf-8'));
                assert.equal(content.data.posts[0].title, 'Post B');

                await rm(dir, {recursive: true, force: true});
            });

            it('Date-only filter outputs only matching posts', async () => {
                const dir = join(tmpdir(), `mg-filter-dateonly-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 1,
                    filter: {createdAt: {onOrBefore: new Date('2023-03-15T00:00:00.000Z')}}
                });
                assert.equal(files.length, 2);
                assert.equal(files[0].posts, 1);
                assert.equal(files[1].posts, 1);

                await rm(dir, {recursive: true, force: true});
            });

            it('Empty result produces single empty JSON file', async () => {
                const dir = join(tmpdir(), `mg-filter-empty-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {filter: {tag: {slug: 'nonexistent'}}});
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 0);

                const content = JSON.parse(await readFile(files[0].path, 'utf-8'));
                assert.equal(content.data.posts.length, 0);

                await rm(dir, {recursive: true, force: true});
            });

            it('Uneven batch remainder gets numbered filename (tag filter)', async () => {
                const dir = join(tmpdir(), `mg-filter-remainder-tag-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 2,
                    filter: {author: {slug: 'alice'}} // 3 matches: A, C, E
                });
                assert.equal(files.length, 2);
                assert.equal(files[0].posts, 2);
                assert.equal(files[1].posts, 1);
                assert.ok(files[1].name.includes('-2'));

                await rm(dir, {recursive: true, force: true});
            });

            it('Uneven batch remainder gets numbered filename (date filter)', async () => {
                const dir = join(tmpdir(), `mg-filter-remainder-date-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 3,
                    filter: {createdAt: {onOrBefore: new Date('2023-09-15T00:00:00.000Z')}} // 4 matches: A, B, C, D
                });
                assert.equal(files.length, 2);
                assert.equal(files[0].posts, 3);
                assert.equal(files[1].posts, 1);
                assert.ok(files[1].name.includes('-2'));

                await rm(dir, {recursive: true, force: true});
            });

            it('Single match with batchSize 1 produces single file (tag filter)', async () => {
                const dir = join(tmpdir(), `mg-filter-single-tag-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 1,
                    filter: {tag: {slug: 'news'}, author: {slug: 'alice'}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 1);
                assert.ok(!files[0].name.includes('-1'));

                await rm(dir, {recursive: true, force: true});
            });

            it('Single match with batchSize 1 produces single file (date filter)', async () => {
                const dir = join(tmpdir(), `mg-filter-single-date-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 1,
                    filter: {
                        createdAt: {
                            after: new Date('2023-12-14T00:00:00.000Z'),
                            before: new Date('2023-12-16T00:00:00.000Z')
                        }
                    }
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 1);
                assert.ok(!files[0].name.includes('-1'));

                await rm(dir, {recursive: true, force: true});
            });

            it('publishedAt-only filter outputs matching posts', async () => {
                const dir = join(tmpdir(), `mg-filter-pubonly-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    filter: {publishedAt: {after: new Date('2023-06-01T00:00:00.000Z')}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 2); // C (Jul) and E (Dec), D excluded (null)

                await rm(dir, {recursive: true, force: true});
            });

            it('Date-only filter with no matches produces single empty JSON file', async () => {
                const dir = join(tmpdir(), `mg-filter-dateempty-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    filter: {createdAt: {after: new Date('2099-01-01T00:00:00.000Z')}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 0);

                await rm(dir, {recursive: true, force: true});
            });
        });
    });

    describe('writeGhostTagsJson', () => {
        it('Writes all tags to a single JSON file', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addTag({name: 'Alpha', slug: 'alpha'});
            post.addTag({name: 'Beta', slug: 'beta'});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-tags-json-${Date.now()}`);
            const file = await ctx.writeGhostTagsJson(dir);

            assert.equal(file.name, 'tags.json');
            assert.equal(file.posts, 0);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.equal(content.data.tags.length, 2);
            assert.equal(content.data.tags[0].name, 'Alpha');
            assert.equal(content.data.tags[1].name, 'Beta');
            assert.ok(content.data.tags[0].id);
            assert.ok(content.meta.exported_on);
            assert.ok(!content.data.posts);
            assert.ok(!content.data.posts_tags);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Supports custom filename', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addTag({name: 'Gamma', slug: 'gamma'});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-tags-custom-${Date.now()}`);
            const file = await ctx.writeGhostTagsJson(dir, {filename: 'my-tags'});

            assert.equal(file.name, 'my-tags.json');

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Writes empty tags array when no tags exist', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const dir = join(tmpdir(), `mg-tags-empty-${Date.now()}`);
            const file = await ctx.writeGhostTagsJson(dir);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.deepEqual(content.data.tags, []);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Excludes orphan tags not assigned to any post', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addTag({name: 'Used', slug: 'used'});
            post.addTag({name: 'Orphan', slug: 'orphan'});
            await post.save(ctx.db);

            // Remove one tag so it becomes orphaned in the Tags table
            post.removeTag('orphan');
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-tags-orphan-${Date.now()}`);
            const file = await ctx.writeGhostTagsJson(dir);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.equal(content.data.tags.length, 1);
            assert.equal(content.data.tags[0].name, 'Used');

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });
    });

    describe('User roles', () => {
        it('Exports roles as an array in the full Ghost JSON', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            post.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com', roles: ['Editor']});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-roles-json-${Date.now()}`);
            const files = await ctx.writeGhostJson(dir);
            const content = JSON.parse(await readFile(files[0].path, 'utf-8'));

            const alice = content.data.users.find((u: any) => u.slug === 'alice');
            const bob = content.data.users.find((u: any) => u.slug === 'bob');

            assert.deepEqual(alice.roles, ['Contributor']);
            assert.deepEqual(bob.roles, ['Editor']);
            assert.equal('role' in alice, false);
            assert.equal('role' in bob, false);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Gives each author its own roles array', async () => {
            const first: any = new AuthorContext({name: 'A', slug: 'a', email: 'a@example.com'});
            const second: any = new AuthorContext({name: 'B', slug: 'b', email: 'b@example.com'});

            assert.deepEqual(first.data.roles, ['Contributor']);
            assert.notEqual(first.data.roles, second.data.roles);

            first.data.roles.push('Editor');
            assert.deepEqual(second.data.roles, ['Contributor']);
        });
    });

    describe('writeGhostUsersJson', () => {
        it('Writes all users to a single JSON file', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            post.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com'});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-users-json-${Date.now()}`);
            const file = await ctx.writeGhostUsersJson(dir);

            assert.equal(file.name, 'users.json');
            assert.equal(file.posts, 0);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.equal(content.data.users.length, 2);
            assert.equal(content.data.users[0].name, 'Alice');
            assert.equal(content.data.users[1].name, 'Bob');
            assert.ok(content.data.users[0].id);
            assert.ok(content.meta.exported_on);
            assert.ok(!content.data.posts);
            assert.ok(!content.data.posts_authors);

            // Ghost expects an array of role names, not a single "role" string
            assert.deepEqual(content.data.users[0].roles, ['Contributor']);
            assert.equal('role' in content.data.users[0], false);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Supports custom filename', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addAuthor({name: 'Carol', slug: 'carol', email: 'carol@example.com'});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-users-custom-${Date.now()}`);
            const file = await ctx.writeGhostUsersJson(dir, {filename: 'my-users'});

            assert.equal(file.name, 'my-users.json');

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Writes empty users array when no authors exist', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const dir = join(tmpdir(), `mg-users-empty-${Date.now()}`);
            const file = await ctx.writeGhostUsersJson(dir);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.deepEqual(content.data.users, []);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Excludes orphan authors not assigned to any post', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addAuthor({name: 'Used', slug: 'used', email: 'used@example.com'});
            post.addAuthor({name: 'Orphan', slug: 'orphan', email: 'orphan@example.com'});
            await post.save(ctx.db);

            // Remove one author so it becomes orphaned in the Authors table
            post.removeAuthor('orphan');
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-users-orphan-${Date.now()}`);
            const file = await ctx.writeGhostUsersJson(dir);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.equal(content.data.users.length, 1);
            assert.equal(content.data.users[0].name, 'Used');

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });
    });

    describe('typed change events and durable reports', () => {
        it('Emits sanitization and slug changes with before/after values after commit', async () => {
            const instance = new MigrateContext({storage: 'memory'});
            await instance.init();

            const sanitized: any[] = [];
            const renamed: any[] = [];
            instance.on('field:sanitized', event => sanitized.push(event));
            instance.on('slug:renamed', event => {
                assert.ok(instance.db.stmts.findPostById.get(event.postId));
                renamed.push(event);
            });

            const first = await instance.addPost({lookupKey: 'first'});
            first.set('title', 'First');
            first.set('slug', 'same-slug');
            first.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            first.save(instance.db);

            const second = await instance.addPost({lookupKey: 'second'});
            second.set('title', 'x'.repeat(300));
            second.set('slug', 'same-slug');
            second.set('created_at', new Date('2026-01-02T00:00:00.000Z'));
            second.save(instance.db);

            assert.equal(sanitized.at(-1).oldValue, 'x'.repeat(300));
            assert.equal(sanitized.at(-1).newValue, 'x'.repeat(255));
            assert.deepEqual(renamed, [
                {
                    postId: second.dbId,
                    lookupKey: 'second',
                    oldSlug: 'same-slug',
                    newSlug: 'same-slug-2',
                    url: ''
                }
            ]);

            const report = instance.getMigrationReport();
            assert.equal(report.summary['post:inserted'], 2);
            assert.equal(report.summary['field:sanitized'], 1);
            assert.equal(report.summary['slug:renamed'], 1);
            assert.equal(
                (report.events.find(event => event.type === 'slug:renamed')!.details as any).newSlug,
                'same-slug-2'
            );

            await instance.close();
        });

        it('Persists duplicate skips for later runs and emits their identity', async () => {
            const filePath = join(tmpdir(), `mg-context-report-${Date.now()}.sqlite`);
            const firstRun = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await firstRun.init();

            const skipped: any[] = [];
            firstRun.on('post:skipped', event => skipped.push(event));

            const original = await firstRun.addPost({lookupKey: 'same-source-id', sourceContent: 'Original'});
            original.set('title', 'Original');
            original.set('slug', 'original');
            original.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            original.save(firstRun.db);

            const duplicate = await firstRun.addPost({lookupKey: 'same-source-id', sourceContent: 'Duplicate'});
            duplicate.set('title', 'Duplicate');
            duplicate.set('slug', 'duplicate');
            duplicate.set('created_at', new Date('2026-01-02T00:00:00.000Z'));
            duplicate.save(firstRun.db);

            assert.deepEqual(skipped, [{lookupKey: 'same-source-id', existingPostId: original.dbId}]);
            await firstRun.close();

            const secondRun = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: post => {
                    post.set('title', post.sourceContent);
                    post.set('slug', 'original');
                    post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
                }
            });
            await secondRun.init();
            const report = secondRun.getMigrationReport();
            assert.equal(report.summary['post:skipped'], 1);
            assert.deepEqual(report.events.find(event => event.type === 'post:skipped')!.details, {
                existingPostId: original.dbId
            });

            await secondRun.close();
            await rm(filePath, {force: true});
        });

        it('Emits complete detached snapshots for replacements', async () => {
            const instance = new MigrateContext({storage: 'memory', onDuplicate: 'replace'});
            await instance.init();

            const original: any = await instance.addPost({
                lookupKey: 'replace-me',
                source: {url: 'https://example.com/old'},
                meta: {revision: 1}
            });
            original.set('title', 'Old title');
            original.set('slug', 'replace-me');
            original.set('html', '<p>Old</p>');
            original.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            original.webscrapeData = {old: true};
            original.addTag({name: 'Old tag', slug: 'old-tag'});
            original.addAuthor({name: 'Old author', slug: 'old-author', email: 'old@example.com'});
            original.save(instance.db);

            let replacementEvent: any;
            instance.on('post:replaced', event => {
                const stored = instance.db.stmts.findPostById.get(event.postId) as any;
                assert.equal(JSON.parse(stored.data).title, 'New title');
                replacementEvent = event;
            });

            const replacement: any = await instance.addPost({
                lookupKey: 'replace-me',
                source: {url: 'https://example.com/new'},
                meta: {revision: 2}
            });
            replacement.set('title', 'New title');
            replacement.set('slug', 'replace-me');
            replacement.set('html', '<p>New</p>');
            replacement.set('created_at', new Date('2026-02-01T00:00:00.000Z'));
            replacement.webscrapeData = {new: true};
            replacement.addTag({name: 'New tag', slug: 'new-tag'});
            replacement.addAuthor({name: 'New author', slug: 'new-author', email: 'new@example.com'});
            replacement.save(instance.db);

            assert.equal(replacementEvent.previous.data.title, 'Old title');
            assert.equal(replacementEvent.previous.data.tags[0].name, 'Old tag');
            assert.equal(replacementEvent.previous.data.authors[0].name, 'Old author');
            assert.deepEqual(replacementEvent.previous.webscrapeData, {old: true});
            assert.equal(replacementEvent.current.data.title, 'New title');
            assert.equal(replacementEvent.current.data.html, '<p>New</p>');
            assert.equal(replacementEvent.current.data.tags[0].name, 'New tag');
            assert.equal(replacementEvent.current.data.authors[0].name, 'New author');
            assert.deepEqual(replacementEvent.current.sourceMeta, {url: 'https://example.com/new'});
            assert.equal(replacementEvent.current.sourceContent, null);
            assert.deepEqual(replacementEvent.current.meta, {revision: 2});

            replacementEvent.current.data.title = 'Listener mutation';
            replacementEvent.current.data.tags[0].name = 'Listener tag mutation';
            const stored = (await instance.findPosts({slug: 'replace-me'}))![0];
            assert.equal(stored.data.title, 'New title');
            assert.equal(stored.data.tags[0].data.name, 'New tag');

            const replaced = instance.getMigrationReport().events.find(event => event.type === 'post:replaced')!;
            assert.ok((replaced.details as any).changedFields.includes('html'));
            assert.ok((replaced.details as any).changedFields.includes('tags'));

            await instance.close();
        });

        it('Leaves a committed replacement intact when its listener throws', async () => {
            const instance = new MigrateContext({storage: 'memory', onDuplicate: 'replace'});
            await instance.init();

            const original = await instance.addPost({lookupKey: 'listener-error'});
            original.set('title', 'Before');
            original.set('slug', 'listener-error');
            original.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            original.save(instance.db);

            instance.on('post:replaced', () => {
                throw new Error('listener failed');
            });

            const replacement = await instance.addPost({lookupKey: 'listener-error'});
            replacement.set('title', 'After');
            replacement.set('slug', 'listener-error');
            replacement.set('created_at', new Date('2026-02-01T00:00:00.000Z'));
            assert.throws(() => replacement.save(instance.db), {message: 'listener failed'});

            assert.equal((await instance.findPosts({slug: 'listener-error'}))![0].data.title, 'After');
            assert.equal(instance.getMigrationReport().summary['post:replaced'], 1);

            await instance.close();
        });

        it('Does not emit or persist rolled-back outcomes', async () => {
            const instance = new MigrateContext({storage: 'memory'});
            await instance.init();
            const sanitized: any[] = [];
            instance.on('field:sanitized', event => sanitized.push(event));

            await assert.rejects(
                instance.transaction(async () => {
                    const post = await instance.addPost({lookupKey: 'rolled-back'});
                    post.set('title', 'x'.repeat(300));
                    post.set('slug', 'rolled-back');
                    post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
                    post.save(instance.db);
                    throw new Error('rollback');
                }),
                {message: 'rollback'}
            );

            assert.deepEqual(sanitized, []);
            assert.equal(instance.hasContent(), false);
            assert.equal(instance.getMigrationReport().events.length, 0);

            await instance.close();
        });

        it('Emits standalone entity sanitization after the save completes', async () => {
            const instance = new MigrateContext({storage: 'memory'});
            await instance.init();
            const events: any[] = [];
            instance.on('field:sanitized', event => events.push(event));

            const tag = new TagContext({name: ',Standalone', slug: 'standalone'});
            tag.save(instance.db);

            assert.equal(events.length, 1);
            assert.equal(events[0].oldValue, ',Standalone');
            assert.equal(events[0].newValue, 'Standalone');
            assert.ok(instance.db.stmts.findTagById.get(tag.dbId));

            await instance.close();
        });
    });

    describe('deduplicateSlugs', () => {
        it('Stores the pre-deduplication slug in original_slug', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Older Post');
            post1.set('slug', 'my-post');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Newer Post');
            post2.set('slug', 'my-post');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            const rows = instance.db.db.prepare('SELECT slug, original_slug FROM Posts ORDER BY id ASC').all() as any[];

            assert.equal(rows.length, 2);
            assert.equal(rows[0].slug, 'my-post');
            assert.equal(rows[0].original_slug, 'my-post');
            assert.equal(rows[1].slug, 'my-post-2');
            assert.equal(rows[1].original_slug, 'my-post');

            await instance.close();
        });

        it('Leaves original_slug untouched when a post is updated', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Older Post');
            post1.set('slug', 'my-post');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Newer Post');
            post2.set('slug', 'my-post');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            post2.set('slug', 'renamed-by-hand');
            await post2.save(instance.db);

            const row = instance.db.db
                .prepare('SELECT slug, original_slug FROM Posts WHERE id = ?')
                .get(post2.dbId) as any;

            assert.equal(row.slug, 'renamed-by-hand');
            assert.equal(row.original_slug, 'my-post');

            await instance.close();
        });

        it('Reports renames from an earlier run when resuming an existing dbPath', async () => {
            const filePath = join(tmpdir(), `mg-context-dedup-resume-${Date.now()}.sqlite`);

            const firstRun: any = new MigrateContext({dbPath: filePath, contentIdentity: TEST_CONTENT_IDENTITY});
            await firstRun.init();

            const post1 = await firstRun.addPost({
                lookupKey: 'blog/my-post',
                sourceContent: 'First',
                source: {url: 'https://example.com/blog/my-post'}
            });
            post1.set('title', 'First');
            post1.set('slug', 'my-post');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(firstRun.db);

            const post2 = await firstRun.addPost({
                lookupKey: 'news/my-post',
                sourceContent: 'Second',
                source: {url: 'https://example.com/news/my-post'}
            });
            post2.set('title', 'Second');
            post2.set('slug', 'my-post');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(firstRun.db);

            await firstRun.close();

            // Resume against the same database — both posts are remapped from source,
            // and the second post claims the same suffixed slug again.
            const secondRun: any = new MigrateContext({
                dbPath: filePath,
                contentIdentity: TEST_CONTENT_IDENTITY,
                mapSourcePost: post => {
                    post.set('title', post.sourceContent);
                    post.set('slug', 'my-post');
                    post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
                }
            });
            await secondRun.init();

            assert.equal(secondRun.db.slugRenames.length, 1);

            const duplicates = await secondRun.deduplicateSlugs();

            assert.equal(duplicates.length, 2);
            assert.equal(duplicates[0].oldSlug, 'my-post');
            assert.equal(duplicates[0].newSlug, 'my-post');
            assert.equal(duplicates[0].url, 'https://example.com/blog/my-post');
            assert.equal(duplicates[1].oldSlug, 'my-post');
            assert.equal(duplicates[1].newSlug, 'my-post-2');
            assert.equal(duplicates[1].url, 'https://example.com/news/my-post');

            await secondRun.close();
            await unlink(filePath);
        });

        it('Ignores a slug that was changed after insert', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Only Post');
            post.set('slug', 'original-slug');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await post.save(instance.db);

            // Renaming after insert leaves original_slug behind, but no post holds
            // "original-slug" any more, so this was not a duplicate-slug collision
            post.set('slug', 'renamed-by-hand');
            await post.save(instance.db);

            const duplicates = await instance.deduplicateSlugs();
            assert.equal(duplicates.length, 0);

            await instance.close();
        });

        it('Returns empty array when no duplicates exist', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Post A');
            post1.set('slug', 'post-a');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Post B');
            post2.set('slug', 'post-b');
            post2.set('created_at', new Date('2023-01-02T00:00:00.000Z'));
            await post2.save(instance.db);

            const duplicates = await instance.deduplicateSlugs();
            assert.equal(duplicates.length, 0);

            await instance.close();
        });

        it('Deduplicates 2 posts with the same slug, oldest keeps original', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({source: {url: 'https://example.com/blog/my-post'}});
            post1.set('title', 'Older Post');
            post1.set('slug', 'my-post');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post1.set('published_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({source: {url: 'https://example.com/news/my-post'}});
            post2.set('title', 'Newer Post');
            post2.set('slug', 'my-post');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            const duplicates = await instance.deduplicateSlugs();

            // Includes retained post + renamed post
            assert.equal(duplicates.length, 2);
            assert.equal(duplicates[0].oldSlug, 'my-post');
            assert.equal(duplicates[0].newSlug, 'my-post');
            assert.equal(duplicates[0].url, 'https://example.com/blog/my-post');
            assert.equal(duplicates[1].oldSlug, 'my-post');
            assert.equal(duplicates[1].newSlug, 'my-post-2');
            assert.equal(duplicates[1].url, 'https://example.com/news/my-post');

            // Verify DB was updated
            const posts = await instance.findPosts({slug: 'my-post'});
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Older Post');

            const renamedPosts = await instance.findPosts({slug: 'my-post-2'});
            assert.equal(renamedPosts.length, 1);
            assert.equal(renamedPosts[0].data.title, 'Newer Post');

            await instance.close();
        });

        it('Deduplicates 3 posts: oldest unchanged, next gets -2, newest gets -3', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Oldest');
            post1.set('slug', 'my-post');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post1.set('published_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Middle');
            post2.set('slug', 'my-post');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            const post3 = await instance.addPost();
            post3.set('title', 'Newest');
            post3.set('slug', 'my-post');
            post3.set('created_at', new Date('2023-12-01T00:00:00.000Z'));
            post3.set('published_at', new Date('2023-12-01T00:00:00.000Z'));
            await post3.save(instance.db);

            const duplicates = await instance.deduplicateSlugs();

            // Retained + 2 renamed = 3 entries, grouped together
            assert.equal(duplicates.length, 3);
            assert.equal(duplicates[0].newSlug, 'my-post');
            assert.equal(duplicates[1].newSlug, 'my-post-2');
            assert.equal(duplicates[2].newSlug, 'my-post-3');

            const oldest = await instance.findPosts({slug: 'my-post'});
            assert.equal(oldest.length, 1);
            assert.equal(oldest[0].data.title, 'Oldest');

            await instance.close();
        });

        it('Skips to -3 when -2 slug already exists', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            // A post that naturally has the slug "my-post-2"
            const existing = await instance.addPost();
            existing.set('title', 'Existing -2');
            existing.set('slug', 'my-post-2');
            existing.set('created_at', new Date('2022-01-01T00:00:00.000Z'));
            existing.set('published_at', new Date('2022-01-01T00:00:00.000Z'));
            await existing.save(instance.db);

            const post1 = await instance.addPost();
            post1.set('title', 'Original');
            post1.set('slug', 'my-post');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post1.set('published_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Duplicate');
            post2.set('slug', 'my-post');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            const duplicates = await instance.deduplicateSlugs();

            // Retained + 1 renamed = 2 entries
            assert.equal(duplicates.length, 2);
            assert.equal(duplicates[0].newSlug, 'my-post');
            assert.equal(duplicates[1].newSlug, 'my-post-3');

            // Verify the existing -2 post was not touched
            const existingPosts = await instance.findPosts({slug: 'my-post-2'});
            assert.equal(existingPosts.length, 1);
            assert.equal(existingPosts[0].data.title, 'Existing -2');

            await instance.close();
        });

        it('Includes source URL for both retained and renamed entries', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({source: {url: 'https://example.com/blog/my-post'}});
            post1.set('title', 'First');
            post1.set('slug', 'my-post');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post1.set('published_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({source: {url: 'https://example.com/news/my-post'}});
            post2.set('title', 'Second');
            post2.set('slug', 'my-post');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            const duplicates = await instance.deduplicateSlugs();

            assert.equal(duplicates.length, 2);
            assert.equal(duplicates[0].url, 'https://example.com/blog/my-post');
            assert.equal(duplicates[1].url, 'https://example.com/news/my-post');

            await instance.close();
        });

        it('Falls back to canonical_url when source.url is absent', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'First');
            post1.set('slug', 'my-post');
            post1.set('canonical_url', 'https://example.com/canonical-1');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post1.set('published_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Second');
            post2.set('slug', 'my-post');
            post2.set('canonical_url', 'https://example.com/canonical-2');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            const duplicates = await instance.deduplicateSlugs();

            assert.equal(duplicates[0].url, 'https://example.com/canonical-1');
            assert.equal(duplicates[1].url, 'https://example.com/canonical-2');

            await instance.close();
        });

        it('Uses created_at when published_at is null', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            // Draft (no published_at) created earlier should keep the slug
            const draft = await instance.addPost();
            draft.set('title', 'Old Draft');
            draft.set('slug', 'my-post');
            draft.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await draft.save(instance.db);

            const published = await instance.addPost();
            published.set('title', 'Published Later');
            published.set('slug', 'my-post');
            published.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            published.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            await published.save(instance.db);

            const duplicates = await instance.deduplicateSlugs();

            assert.equal(duplicates.length, 2);
            assert.equal(duplicates[0].newSlug, 'my-post');
            assert.equal(duplicates[1].newSlug, 'my-post-2');

            const kept = await instance.findPosts({slug: 'my-post'});
            assert.equal(kept[0].data.title, 'Old Draft');

            await instance.close();
        });

        it('Handles multiple different duplicate slug groups', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            for (const [slug, title, date] of [
                ['alpha', 'Alpha 1', '2023-01-01'],
                ['alpha', 'Alpha 2', '2023-06-01'],
                ['beta', 'Beta 1', '2023-02-01'],
                ['beta', 'Beta 2', '2023-07-01'],
                ['beta', 'Beta 3', '2023-12-01'],
                ['gamma', 'Gamma Only', '2023-03-01']
            ] as const) {
                const post = await instance.addPost();
                post.set('title', title);
                post.set('slug', slug);
                post.set('created_at', new Date(`${date}T00:00:00.000Z`));
                post.set('published_at', new Date(`${date}T00:00:00.000Z`));
                await post.save(instance.db);
            }

            const duplicates = await instance.deduplicateSlugs();

            // alpha: retained + 1 renamed = 2, beta: retained + 2 renamed = 3, total = 5
            assert.equal(duplicates.length, 5);

            const alphas = duplicates.filter((d: any) => d.oldSlug === 'alpha');
            assert.equal(alphas.length, 2);
            assert.equal(alphas[0].newSlug, 'alpha');
            assert.equal(alphas[1].newSlug, 'alpha-2');

            const betas = duplicates.filter((d: any) => d.oldSlug === 'beta');
            assert.equal(betas.length, 3);
            assert.equal(betas[0].newSlug, 'beta');
            assert.equal(betas[1].newSlug, 'beta-2');
            assert.equal(betas[2].newSlug, 'beta-3');

            // gamma should not appear
            const gammas = duplicates.filter((d: any) => d.oldSlug === 'gamma');
            assert.equal(gammas.length, 0);

            // Verify grouping: all alpha entries come before all beta entries
            const lastAlphaIdx = duplicates.findLastIndex((d: any) => d.oldSlug === 'alpha');
            const firstBetaIdx = duplicates.findIndex((d: any) => d.oldSlug === 'beta');
            assert.ok(lastAlphaIdx < firstBetaIdx, 'alpha group should come before beta group');

            await instance.close();
        });

        it('prepareForExport deduplicates and results are used by writeGhostJson', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({source: {url: 'https://example.com/first'}});
            post1.set('title', 'First');
            post1.set('slug', 'dupe');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post1.set('published_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({source: {url: 'https://example.com/second'}});
            post2.set('title', 'Second');
            post2.set('slug', 'dupe');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.addAuthor({name: 'Test', slug: 'test', email: 'test@example.com'});
            await post2.save(instance.db);

            await instance.prepareForExport();
            const files = await instance.writeGhostJson(tmpdir(), {filename: 'dedup-test'});
            const content = JSON.parse(await readFile(files[0].path, 'utf-8'));
            const slugs = content.data.posts.map((p: any) => p.slug);

            assert.ok(slugs.includes('dupe'));
            assert.ok(slugs.includes('dupe-2'));

            // Results accessible via getter — includes retained + renamed
            assert.equal(instance.duplicateSlugs.length, 2);
            assert.equal(instance.duplicateSlugs[0].oldSlug, 'dupe');
            assert.equal(instance.duplicateSlugs[0].newSlug, 'dupe');
            assert.equal(instance.duplicateSlugs[0].url, 'https://example.com/first');
            assert.equal(instance.duplicateSlugs[1].newSlug, 'dupe-2');
            assert.equal(instance.duplicateSlugs[1].url, 'https://example.com/second');

            await unlink(files[0].path);
            await instance.close();
        });

        it('Only runs once even when called multiple times', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'First');
            post1.set('slug', 'once');
            post1.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post1.set('published_at', new Date('2023-01-01T00:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Second');
            post2.set('slug', 'once');
            post2.set('created_at', new Date('2023-06-01T00:00:00.000Z'));
            post2.set('published_at', new Date('2023-06-01T00:00:00.000Z'));
            await post2.save(instance.db);

            const first = await instance.deduplicateSlugs();
            assert.equal(first.length, 2);

            // Second call returns cached result without modifying anything
            const second = await instance.deduplicateSlugs();
            assert.equal(second.length, 2);
            assert.deepEqual(first, second);

            // Slug wasn't double-renamed
            const posts = await instance.findPosts({slug: 'once-2'});
            assert.equal(posts.length, 1);

            await instance.close();
        });
    });

    describe('sanitizedFields', () => {
        it('Stores a fallback when a post title is missing', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('slug', 'untitled');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await post.save(instance.db);

            const stored = await instance.findPosts({slug: 'untitled'});
            assert.equal(stored[0].data.title, '(Untitled)');

            const titleChange = instance.sanitizedFields.find((entry: any) => entry.field === 'title');
            assert.equal(titleChange.reason, 'replaced');
            assert.equal(titleChange.oldValue, null);
            assert.equal(titleChange.newValue, '(Untitled)');

            await instance.close();
        });

        it('Reports values trimmed on the way into the database', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'a'.repeat(300));
            post.set('slug', 'long-title-post');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.addTag({name: 'b'.repeat(200), slug: 'long-tag'});
            post.addAuthor({name: 'Jane', slug: 'jane', email: 'hello@world.com123'});
            await post.save(instance.db);

            const byField = new Map<string, any>(
                instance.sanitizedFields.map((f: any) => [`${f.context}.${f.field}`, f])
            );

            assert.equal(byField.get('PostContext.title').reason, 'truncated');
            assert.equal(byField.get('PostContext.title').newValue.length, 255);
            assert.equal(byField.get('PostContext.title').slug, 'long-title-post');

            assert.equal(byField.get('TagContext.name').reason, 'truncated');
            assert.equal(byField.get('TagContext.name').newValue.length, 191);
            assert.equal(byField.get('TagContext.name').slug, 'long-tag');

            assert.equal(byField.get('AuthorContext.email').reason, 'replaced');
            assert.equal(byField.get('AuthorContext.email').newValue, 'hello-world@example.com');

            // The truncated values are what actually landed in the database
            const stored = await instance.findPosts({slug: 'long-title-post'});
            assert.equal(stored[0].data.title.length, 255);
            assert.equal(stored[0].data.tags[0].data.name.length, 191);
            assert.equal(stored[0].data.authors[0].data.email, 'hello-world@example.com');

            await instance.close();
        });

        it('Is empty when nothing needed changing', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Fine');
            post.set('slug', 'fine');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            await post.save(instance.db);

            assert.equal(instance.sanitizedFields.length, 0);

            await instance.close();
        });

        it('Keeps a deduplicated slug within the maximum length', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            // A slug already at the maximum length — the "-2" must not push it over
            const longSlug = 'a'.repeat(191);

            for (const title of ['First', 'Second']) {
                const post = await instance.addPost();
                post.set('title', title);
                post.set('slug', longSlug);
                post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
                await post.save(instance.db);
            }

            const rows = instance.db.db.prepare('SELECT slug FROM Posts ORDER BY id ASC').all() as any[];

            assert.equal(rows[0].slug, longSlug);
            assert.equal(rows[1].slug, `${'a'.repeat(189)}-2`);
            assert.equal(rows[1].slug.length, 191);

            await instance.close();
        });
    });
});
