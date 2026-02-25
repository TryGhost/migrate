import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

describe('Options to Sywac', function () {
    it('Convert options to defaults', function () {
        let options = [
            {
                type: 'string',
                flags: '--url',
                defaultValue: null,
                desc: 'URL to live site',
                required: true
            },
            {
                type: 'boolean',
                flags: '-Z, --zip',
                defaultValue: true,
                desc: 'Create a zip file (set to false to skip)'
            },
            {
                type: 'array',
                flags: '--scrape',
                choices: ['all', 'img', 'web', 'media', 'files', 'none'],
                defaultValue: ['all'],
                desc: 'Configure scraping tasks'
            }
        ];

        let defaults = convertOptionsToDefaults(options);

        assert.ok('url' in defaults);
        assert.ok('Z' in defaults);
        assert.ok('zip' in defaults);
        assert.ok('scrape' in defaults);
        assert.equal(defaults.url, null);
        assert.equal(defaults.Z, true);
        assert.equal(defaults.zip, true);
        assert.deepEqual(defaults.scrape, ['all']);
    });
});
