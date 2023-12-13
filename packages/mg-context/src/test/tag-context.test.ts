import assert from 'node:assert/strict';
import TagContext from '../lib/TagContext.js';

describe('TagContext', () => {
    test('Is instance of', () => {
        const tag: any = new TagContext();

        assert.equal(tag instanceof TagContext, true);
    });

    test('Has schema', () => {
        const tag: any = new TagContext();

        assert.deepEqual(tag.schema, {
            name: {required: true, type: 'string', maxLength: 255},
            slug: {required: true, type: 'string', maxLength: 191},
            description: {type: 'string', maxLength: 500, default: null},
            feature_image: {type: 'string', maxLength: 2000},
            og_image: {type: 'string', maxLength: 2000},
            og_title: {type: 'string', maxLength: 300},
            og_description: {type: 'string', maxLength: 500},
            twitter_image: {type: 'string', maxLength: 2000},
            twitter_title: {type: 'string', maxLength: 300},
            twitter_description: {type: 'string', maxLength: 500},
            meta_title: {type: 'string', maxLength: 300},
            meta_description: {type: 'string', maxLength: 500},
            codeinjection_head: {type: 'text', maxLength: 65535},
            codeinjection_foot: {type: 'text', maxLength: 65535},
            canonical_url: {type: 'string', maxLength: 2000}
        });
    });

    test('Can accept initialData', () => {
        const tag: any = new TagContext({
            initialData: {
                name: 'Test',
                slug: 'test'
            }
        });

        assert.equal(tag.data.name, 'Test');
        assert.equal(tag.data.slug, 'test');
    });

    test('Can set set properties with set() method', () => {
        const tag: any = new TagContext();
        tag.set('name', 'Test');
        tag.set('slug', 'test');

        assert.equal(tag.data.name, 'Test');
        assert.equal(tag.data.slug, 'test');
    });

    test('Will use constructor param as initialValue if one object supplied', () => {
        const tag: any = new TagContext({
            name: 'Test',
            slug: 'test'
        });

        assert.equal(tag.data.name, 'Test');
        assert.equal(tag.data.slug, 'test');
    });

    test('Can add tag information', () => {
        const tag: any = new TagContext({
            name: 'Test',
            slug: 'test'
        });

        tag.set('description', 'My description');

        assert.equal(tag.data.description, 'My description');
    });

    test('Can edit tag information', () => {
        const tag: any = new TagContext({
            name: 'Test',
            slug: 'test'
        });

        tag.set('slug', 'testing');

        assert.equal(tag.data.slug, 'testing');
    });

    test('Can remove tag information', () => {
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
