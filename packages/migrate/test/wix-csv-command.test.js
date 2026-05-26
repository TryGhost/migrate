import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import wixCSVCommand from '../commands/wix-csv.js';
import wixCSVSource from '../sources/wix-csv.js';

describe('Wix CSV command', function () {
    it('registers command metadata and defaults', function () {
        assert.equal(wixCSVCommand.id, 'wix-csv');
        assert.equal(wixCSVCommand.flags, 'wix-csv');
        assert.equal(wixCSVCommand.defaults.posts, null);
        assert.equal(wixCSVCommand.defaults.url, null);
        assert.deepEqual(wixCSVCommand.defaults.scrape, ['assets']);
        assert.equal(wixCSVCommand.defaults.includeMainCategory, true);
        assert.equal(wixCSVCommand.defaults.includeCategories, true);
        assert.equal(wixCSVCommand.defaults.includeTags, true);
        assert.equal(wixCSVCommand.defaults.zip, true);
    });

    it('provides the expected source task flow', function () {
        const tasks = wixCSVSource.getFullTaskList({
            scrape: ['none'],
            url: 'https://example.com',
            zip: false,
            cache: true
        });

        assert.deepEqual(tasks.map(task => task.title), [
            'Initializing Workspace',
            'Read Wix CSV content',
            'Fetch existing Ghost users',
            'Build Link Map',
            'Format data as Ghost JSON',
            'Fetch images via AssetScraper',
            'Update links in content via LinkFixer',
            'Convert HTML -> Lexical',
            'Write Ghost import JSON File',
            'Write Ghost import zip',
            'Clearing cached files'
        ]);
    });
});
