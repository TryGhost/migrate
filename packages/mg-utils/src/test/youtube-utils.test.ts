import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {getYouTubeID} from '../lib/youtube-utils.js';

describe('getYouTubeID', function () {
    it('extracts ID from standard watch URL', function () {
        assert.equal(getYouTubeID('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('extracts ID from short youtu.be URL', function () {
        assert.equal(getYouTubeID('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('extracts ID from embed URL', function () {
        assert.equal(getYouTubeID('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('extracts ID from /v/ URL', function () {
        assert.equal(getYouTubeID('https://www.youtube.com/v/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('extracts ID from URL with extra query params', function () {
        assert.equal(getYouTubeID('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120'), 'dQw4w9WgXcQ');
    });

    it('extracts ID from vi/ URL', function () {
        assert.equal(getYouTubeID('https://www.youtube.com/vi/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('extracts ID from v%3D encoded URL', function () {
        assert.equal(getYouTubeID('https://www.youtube.com/watch?v%3DdQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    });

    it('returns the input string when no ID is found', function () {
        assert.equal(getYouTubeID('not-a-youtube-url'), 'not-a-youtube-url');
    });
});
