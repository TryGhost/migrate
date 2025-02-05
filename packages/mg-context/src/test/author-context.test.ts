import assert from 'node:assert/strict';
import AuthorContext from '../lib/AuthorContext.js';

describe('AuthorContext', () => {
    test('Is instance of', () => {
        const author: any = new AuthorContext();

        assert.equal(author instanceof AuthorContext, true);
    });

    test('Has schema', () => {
        const author: any = new AuthorContext();

        // Check the number of items
        assert.equal(Object.keys(author.schema).length, 13);

        // And to sanity check, look at the first item
        assert.equal(author.schema.name.required, true);
        assert.equal(author.schema.name.type, 'string');
        assert.equal(author.schema.name.maxLength, 191);
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

    test('Will throw on an invalid email address', () => {
        const thisIs80Chars = 'this-string-is-80-chars-long-lorem-ipsum-dolor-sit-amet-consectetur-adipiscing-el';

        const author = new AuthorContext({
            name: 'Test',
            slug: 'test',
            website: 'https://test.com'
        });

        assert.throws(() => author.set('email', `${thisIs80Chars}@email.com`), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(Author) Invalid email address'
        });
    });
});
