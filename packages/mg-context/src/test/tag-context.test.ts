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
        assert.equal(nameInfo.maxLength, 191);
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

    it('Truncates a string value that is too long', () => {
        const tag: any = new TagContext();
        const longName = 'a'.repeat(256);

        tag.set('name', longName);

        assert.equal(tag.data.name, 'a'.repeat(191));
    });

    it('Includes the failing value as context in validation errors', () => {
        // The constructor bypasses set(), so the value reaches validate() unsanitized
        const longName = 'a'.repeat(256);
        const tag: any = new TagContext({name: longName, slug: 'test'});

        try {
            const final = tag.getFinal;
            assert.fail(`Expected an error, got ${JSON.stringify(final)}`);
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

    it('Strips a leading comma from the name', () => {
        // Ghost validates tag names with matches: /^([^,]|$)/
        const tag: any = new TagContext({name: ', Comma First', slug: 'comma-first'});
        const collected: any[] = [];

        tag.sanitize(collected);

        assert.equal(tag.data.name, 'Comma First');
        assert.equal(collected.length, 1);
        assert.equal(collected[0].field, 'name');
        assert.equal(collected[0].reason, 'replaced');
        assert.equal(collected[0].slug, 'comma-first');
    });

    it('Keeps a comma that is not at the start of the name', () => {
        const tag: any = new TagContext({name: 'Hello, World', slug: 'hello-world'});

        tag.sanitize();

        assert.equal(tag.data.name, 'Hello, World');
    });
});
