import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import beehiivApiMembers from '../index.js';

describe('beehiiv API Members Package', () => {
    it('exports listPublications', () => {
        assert.ok(typeof beehiivApiMembers.listPublications === 'function');
    });

    it('exports fetchTasks', () => {
        assert.ok(typeof beehiivApiMembers.fetchTasks === 'function');
    });

    it('exports mapMembersTasks', () => {
        assert.ok(typeof beehiivApiMembers.mapMembersTasks === 'function');
    });
});
