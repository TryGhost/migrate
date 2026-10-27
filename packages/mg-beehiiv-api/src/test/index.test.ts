import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import * as beehiivApi from '../index.js';

describe('beehiiv API index exports', () => {
    it('exports the publication listing and the source record lifecycle', () => {
        for (const name of ['listPublications', 'authedClient', 'discover', 'tasks', 'parse', 'ingest', 'map']) {
            assert.equal(typeof (beehiivApi as any)[name], 'function', name);
        }
        assert.equal('fetchTasks' in beehiivApi, false);
        assert.equal('mapPostsTasks' in beehiivApi, false);
    });
});
