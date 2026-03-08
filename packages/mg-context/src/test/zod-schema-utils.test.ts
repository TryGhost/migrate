import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {z} from 'zod/v4';
import {getFieldInfo} from '../lib/zod-schema-utils.js';

describe('getFieldInfo', function () {
    it('Identifies required string with maxLength', function () {
        const info = getFieldInfo(z.string().max(255));

        assert.equal(info.required, true);
        assert.equal(info.type, 'string');
        assert.equal(info.maxLength, 255);
        assert.equal(info.hasDefault, false);
        assert.equal(info.defaultValue, null);
    });

    it('Identifies nullable string as not required', function () {
        const info = getFieldInfo(z.string().max(500).nullable());

        assert.equal(info.required, false);
        assert.equal(info.type, 'string');
        assert.equal(info.maxLength, 500);
    });

    it('Identifies optional string as not required', function () {
        const info = getFieldInfo(z.string().max(100).optional());

        assert.equal(info.required, false);
        assert.equal(info.type, 'string');
        assert.equal(info.maxLength, 100);
    });

    it('Extracts boolean default', function () {
        const info = getFieldInfo(z.boolean().default(false));

        assert.equal(info.required, true);
        assert.equal(info.type, 'boolean');
        assert.equal(info.hasDefault, true);
        assert.equal(info.defaultValue, false);
    });

    it('Maps date to dateTime', function () {
        const info = getFieldInfo(z.date());

        assert.equal(info.required, true);
        assert.equal(info.type, 'dateTime');
    });

    it('Maps nullable date to optional dateTime', function () {
        const info = getFieldInfo(z.date().nullable());

        assert.equal(info.required, false);
        assert.equal(info.type, 'dateTime');
    });

    it('Maps enum to string with choices', function () {
        const info = getFieldInfo(z.enum(['a', 'b']).default('a'));

        assert.equal(info.type, 'string');
        assert.deepEqual(info.choices, ['a', 'b']);
        assert.equal(info.defaultValue, 'a');
        assert.equal(info.required, true);
    });

    it('Extracts array maxLength and default', function () {
        const info = getFieldInfo(z.array(z.any()).max(500).default([]));

        assert.equal(info.type, 'array');
        assert.equal(info.maxLength, 500);
        assert.deepEqual(info.defaultValue, []);
        assert.equal(info.required, true);
    });

    it('Passes through unknown types as-is', function () {
        const info = getFieldInfo(z.object({id: z.string()}));

        assert.equal(info.type, 'object');
        assert.equal(info.required, true);
    });

    it('Returns no maxLength when none specified', function () {
        const info = getFieldInfo(z.string());

        assert.equal(info.maxLength, undefined);
    });
});
