import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import beehiivApi from '../index.js';

describe('beehiiv API index exports', () => {
    it('exports listPublications', () => {
        assert.ok(typeof beehiivApi.listPublications === 'function');
    });

    it('exports fetchTasks', () => {
        assert.ok(typeof beehiivApi.fetchTasks === 'function');
    });

    it('exports mapPostsTasks', () => {
        assert.ok(typeof beehiivApi.mapPostsTasks === 'function');
    });
});
