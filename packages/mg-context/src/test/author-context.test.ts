import assert from 'node:assert/strict';
import AuthorContext from '../lib/AuthorContext.js';

describe('AuthorContext', () => {
    test('Is instance of', () => {
        const author: any = new AuthorContext();

        assert.equal(author instanceof AuthorContext, true);
    });

    test('Has schema', () => {
        const tag: any = new AuthorContext();

        assert.deepEqual(tag.schema, {
            name: {require: true, type: 'string', maxLength: 191},
            slug: {require: true, type: 'string', maxLength: 191},
            email: {require: true, type: 'string', maxLength: 191},
            profile_image: {type: 'string', maxLength: 2000},
            cover_image: {type: 'string', maxLength: 2000},
            bio: {type: 'text', maxLength: 200},
            website: {type: 'string', maxLength: 2000},
            location: {type: 'text', maxLength: 150},
            facebook: {type: 'string', maxLength: 2000},
            twitter: {type: 'string', maxLength: 2000},
            meta_title: {type: 'string', maxLength: 300},
            meta_description: {type: 'string', maxLength: 500},
            role: {required: true, type: 'string', choices: ['Contributor', 'Author', 'Editor', 'Administrator'], default: 'Contributor'}
        });
    });

    test('Can accept initialData', () => {
        const author: any = new AuthorContext({
            initialData: {
                name: 'Test',
                slug: 'test',
                email: 'test@email.com'
            }
        });

        assert.equal(author.data.name, 'Test');
        assert.equal(author.data.slug, 'test');
        assert.equal(author.data.email, 'test@email.com');
    });

    test('Will use constructor param as initialValue if one object supplied', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        assert.equal(author.data.name, 'Test');
        assert.equal(author.data.slug, 'test');
        assert.equal(author.data.email, 'test@email.com');
    });

    test('Can add author information', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        author.set('website', 'https://test.com');

        assert.equal(author.data.website, 'https://test.com');
    });

    test('Can edit author information', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        assert.equal(author.data.email, 'test@email.com');

        author.set('email', 'test2@email.com');

        assert.equal(author.data.email, 'test2@email.com');
    });

    test('Can remove author information', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com',
            website: 'https://test.com'
        });

        assert.equal(author.data.website, 'https://test.com');

        author.remove('website');

        assert.equal(author.data.website, null);
    });
});
