import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import TagContext from '../lib/TagContext.js';
import {getFieldInfo} from '../lib/zod-schema-utils.js';

describe('TagContext', () => {
    it('Is instance of', () => {
        const tag: any = new TagContext();

        assert.equal(tag instanceof TagContext, true);
    });

    it('Has schema', () => {
        const tag: any = new TagContext();

        // Check the number of items
        assert.equal(Object.keys(tag.schema.shape).length, 15);

        // And to sanity check, look at the first item
        const nameInfo = getFieldInfo(tag.schema.shape.name);
        assert.equal(nameInfo.required, true);
        assert.equal(nameInfo.type, 'string');
        assert.equal(nameInfo.maxLength, 255);
    });

    it('Can accept initialData', () => {
        const tag: any = new TagContext({
            initialData: {
                name: 'Test',
                slug: 'test'
            }
        });

        assert.equal(tag.data.name, 'Test');
        assert.equal(tag.data.slug, 'test');
    });

    it('Can set set properties with set() method', () => {
        const tag: any = new TagContext();
        tag.set('name', 'Test');
        tag.set('slug', 'test');

        assert.equal(tag.data.name, 'Test');
        assert.equal(tag.data.slug, 'test');
    });

    it('Will use constructor param as initialValue if one object supplied', () => {
        const tag: any = new TagContext({
            name: 'Test',
            slug: 'test'
        });

        assert.equal(tag.data.name, 'Test');
        assert.equal(tag.data.slug, 'test');
    });

    it('Can add tag information', () => {
        const tag: any = new TagContext({
            name: 'Test',
            slug: 'test'
        });

        tag.set('description', 'My description');

        assert.equal(tag.data.description, 'My description');
    });

    it('Can edit tag information', () => {
        const tag: any = new TagContext({
            name: 'Test',
            slug: 'test'
        });

        tag.set('slug', 'testing');

        assert.equal(tag.data.slug, 'testing');
    });

    it('Will throw on string value that is too long', () => {
        const tag: any = new TagContext();
        const longName = 'a'.repeat(256);

        assert.throws(() => tag.set('name', longName), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TagContext) Value for "name" is too long. Currently 256 characters, Max 255.'
        });
    });

    it('Includes the failing value as context in validation errors', () => {
        const tag: any = new TagContext();
        const longName = 'a'.repeat(256);

        try {
            tag.set('name', longName);
            assert.fail('Expected an error');
        } catch (err: any) {
            assert.equal(err.context, longName);
        }
    });

    it('Will throw on unknown property', () => {
        const tag: any = new TagContext();

        assert.throws(() => tag.set('nonexistent', 'value'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(TagContext) Property "nonexistent" is not allowed in TagContext'
        });
    });

    it('Can remove tag information', () => {
        const tag: any = new TagContext({
            name: 'Test',
            slug: 'test',
            description: 'My description'
        });

        assert.equal(tag.data.description, 'My description');

        tag.remove('description');

        assert.equal(tag.data.description, null);
    });
});
