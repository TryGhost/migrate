import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {join} from 'node:path';
import processTxt from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

describe('Medium Members', () => {
    it('Can parse txt file', async () => {
        const processed = await processTxt({txtPath: join(fixturesPath, 'members.txt')});

        assert.equal(processed.length, 5);
    });
});
