import {convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

describe('Options to Sywac', function () {
    test('Convert options to defaults', function () {
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

        expect(defaults).toContainAllKeys(['url', 'Z', 'zip', 'scrape']);
        expect(defaults.url).toEqual(null);
        expect(defaults.Z).toEqual(true);
        expect(defaults.zip).toEqual(true);
        expect(defaults.scrape).toEqual(['all']);
    });
});
