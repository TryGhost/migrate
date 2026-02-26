import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import TagContext from '../lib/TagContext.js';

describe('TagContext', () => {
    it('Is instance of', () => {
        const tag: any = new TagContext();

        assert.equal(tag instanceof TagContext, true);
    });

    it('Has schema', () => {
        const tag: any = new TagContext();

        // Check the number of items
        assert.equal(Object.keys(tag.schema).length, 15);

        // And to sanity check, look at the first item
        assert.equal(tag.schema.name.required, true);
        assert.equal(tag.schema.name.type, 'string');
        assert.equal(tag.schema.name.maxLength, 255);
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
