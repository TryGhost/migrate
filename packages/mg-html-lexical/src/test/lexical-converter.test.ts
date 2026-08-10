import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';
import lexicalConverter, {loadLexicalConverter} from '../lib/lexical-converter.js';

describe('lexicalConverter', function () {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(function () {
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    });

    it('Exposes htmlToLexical', function () {
        assert.equal(typeof lexicalConverter.htmlToLexical, 'function');
    });

    it('Restores NODE_ENV when it was set to development', function () {
        process.env.NODE_ENV = 'development';

        const converter = loadLexicalConverter();

        assert.equal(process.env.NODE_ENV, 'development');
        assert.equal(typeof converter.htmlToLexical, 'function');
    });

    it('Leaves NODE_ENV alone when it is not development', function () {
        process.env.NODE_ENV = 'test';

        const converter = loadLexicalConverter();

        assert.equal(process.env.NODE_ENV, 'test');
        assert.equal(typeof converter.htmlToLexical, 'function');
    });

    it('Leaves NODE_ENV unset when it was never set', function () {
        delete process.env.NODE_ENV;

        const converter = loadLexicalConverter();

        assert.equal(process.env.NODE_ENV, undefined);
        assert.equal(typeof converter.htmlToLexical, 'function');
    });
});
