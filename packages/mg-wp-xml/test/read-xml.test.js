import assert from 'node:assert/strict';
import {join} from 'node:path';
import {contentStats} from '../lib/read-xml.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Read file', function () {
    test('Can read post and page count', async function () {
        const result = await contentStats(join(__dirname, 'fixtures/sample.xml'));

        assert.deepEqual(result, {
            posts: 3,
            pages: 1
        });
    });

    test('Can read post and page count where there are no pages', async function () {
        const result = await contentStats(join(__dirname, 'fixtures/multiple/posts-only.xml'));

        assert.deepEqual(result, {
            posts: 3,
            pages: 0
        });
    });
});
