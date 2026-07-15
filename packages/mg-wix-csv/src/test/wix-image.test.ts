import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {buildWixStaticUrl, parseWixImageUri, wixImageUriToUrl, wixMediaIdToUrl} from '../lib/wix-image.js';

describe('Wix image URL helpers', () => {
    it('transforms Wix image URIs into static media URLs', () => {
        const input =
            'wix:image://v1/example_media_image~mv2.jpg/example_media_image~mv2.jpg#originWidth=6016&originHeight=4016';
        const output = wixImageUriToUrl(input);

        assert.equal(output, 'https://static.wixstatic.com/media/example_media_image~mv2.jpg');
    });

    it('keeps existing URLs and rejects invalid values', () => {
        assert.equal(wixImageUriToUrl('https://example.com/image.jpg'), 'https://example.com/image.jpg');
        assert.equal(wixImageUriToUrl('not-wix'), null);
        assert.equal(wixImageUriToUrl(), null);
    });

    it('parses URI parts', () => {
        assert.deepEqual(parseWixImageUri('wix:image://v1/id/file.jpg#originWidth=x&originHeight='), {
            id: 'id',
            filename: 'file.jpg'
        });
        assert.deepEqual(parseWixImageUri('wix:image://v1/id/file.jpg'), {
            id: 'id',
            filename: 'file.jpg'
        });
        assert.equal(parseWixImageUri('wix:image://v1/%ZZ/file.jpg'), null);
        assert.equal(parseWixImageUri('wix:image://v1/id/%ZZ.jpg'), null);
        assert.equal(parseWixImageUri('bad'), null);
    });

    it('builds URLs from rich-content media IDs', () => {
        assert.equal(
            wixMediaIdToUrl({id: 'image one.jpg', width: 500, height: 250}),
            'https://static.wixstatic.com/media/image%20one.jpg'
        );
        assert.equal(wixMediaIdToUrl({}), null);
        assert.equal(
            buildWixStaticUrl({id: 'id.jpg', filename: 'file.jpg'}),
            'https://static.wixstatic.com/media/id.jpg'
        );
    });
});
