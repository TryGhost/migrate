import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {describe, it, afterEach} from 'node:test';
import lexicalConverter, {loadLexicalConverter} from '../lib/lexical-converter.js';

const execFileAsync = promisify(execFile);

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

    it('Converts quietly without changing a development environment', async function () {
        const converterUrl = new URL('../index.js', import.meta.url).href;
        const script = `
            const {htmlToLexical} = await import(${JSON.stringify(converterUrl)});
            const lexical = htmlToLexical('<p>Hello</p>');
            process.stdout.write(JSON.stringify({nodeEnv: process.env.NODE_ENV, rootType: lexical.root.type}));
        `;

        const {stdout, stderr} = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
            env: {...process.env, NODE_ENV: 'development'}
        });

        assert.equal(stderr, '');
        assert.deepEqual(JSON.parse(stdout), {
            nodeEnv: 'development',
            rootType: 'root'
        });
    });
});
