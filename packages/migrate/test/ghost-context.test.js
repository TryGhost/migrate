import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ghostSource from '../sources/ghost.js';

describe('Ghost API context lifecycle', function () {
    it('reuses mapped posts by default, rereads on request, and preserves the asset cache', async function () {
        const tmpPath = await mkdtemp(join(tmpdir(), 'mg-ghost-context-test-'));
        const options = {
            url: 'https://example.com',
            scrape: [],
            batch: 0,
            tmpPath,
            cacheName: 'test-ghost-source'
        };
        const task = {title: 'Initializing Workspace'};
        assert.equal(
            ghostSource.getFullTaskList(options).some(step => step.title === 'Prepare data for export'),
            false
        );

        try {
            const first = {};
            await ghostSource.getFullTaskList(options)[0].task(first, task);
            await first.migrateContext.addSourcePost(post => {
                post.setSource('lookupKey', 'ghost-post-1');
                post.setSource(
                    'content',
                    JSON.stringify({
                        id: 'ghost-post-1',
                        url: 'https://example.com/ghost-post/',
                        title: 'Original Ghost post',
                        slug: 'ghost-post',
                        html: '<p>Original HTML</p>',
                        created_at: '2026-01-01T00:00:00.000Z'
                    })
                );
                post.setSource('meta', {url: 'https://example.com/ghost-post/'});
                post.set('title', 'Original Ghost post');
                post.set('slug', 'ghost-post');
                post.set('html', '<p>Original HTML</p>');
                post.set('created_at', new Date('2026-01-01T00:00:00.000Z'));
            });
            first.migrateContext.addLink('example.com/old/', '/new/');
            const cacheMarker = join(first.fileCache.tmpDir, 'assets-cache', 'marker.txt');
            await writeFile(cacheMarker, 'cached asset');
            await first.migrateContext.close();

            const info = {};
            await ghostSource.getInfoTaskList(options)[0].task(info, task);
            assert.equal(info.migrateContext, undefined);
            assert.equal(info.assetScraper, undefined);

            const second = {};
            await ghostSource.getFullTaskList(options)[0].task(second, task);
            assert.equal(second.hasStoredSource, true);
            assert.equal(ghostSource.getFullTaskList(options)[1].skip(second), true);
            assert.equal((await second.migrateContext.getAllPosts())[0].data.html, '<p>Original HTML</p>');
            assert.equal(await readFile(cacheMarker, 'utf8'), 'cached asset');
            await second.migrateContext.close();

            const third = {};
            await ghostSource.getFullTaskList({...options, rereadSource: true})[0].task(third, task);
            assert.equal(third.migrateContext.hasContent(), false);
            assert.equal(ghostSource.getFullTaskList({...options, rereadSource: true})[1].skip(third), false);
            assert.equal(await readFile(cacheMarker, 'utf8'), 'cached asset');
            await third.migrateContext.close();
        } finally {
            await rm(tmpPath, {recursive: true, force: true});
        }
    });
});
