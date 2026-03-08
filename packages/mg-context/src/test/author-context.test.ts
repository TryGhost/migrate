import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import AuthorContext from '../lib/AuthorContext.js';
import {getFieldInfo} from '../lib/zod-schema-utils.js';

describe('AuthorContext', () => {
    it('Is instance of', () => {
        const author: any = new AuthorContext();

        assert.equal(author instanceof AuthorContext, true);
    });

    it('Has schema', () => {
        const author: any = new AuthorContext();

        // Check the number of items
        assert.equal(Object.keys(author.schema.shape).length, 13);

        // And to sanity check, look at the first item
        const nameInfo = getFieldInfo(author.schema.shape.name);
        assert.equal(nameInfo.required, true);
        assert.equal(nameInfo.type, 'string');
        assert.equal(nameInfo.maxLength, 191);
    });

    it('Can accept initialData', () => {
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

    it('Will use constructor param as initialValue if one object supplied', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        assert.equal(author.data.name, 'Test');
        assert.equal(author.data.slug, 'test');
        assert.equal(author.data.email, 'test@email.com');
    });

    it('Can add author information', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        author.set('website', 'https://test.com');

        assert.equal(author.data.website, 'https://test.com');
    });

    it('Can edit author information', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        assert.equal(author.data.email, 'test@email.com');

        author.set('email', 'test2@email.com');

        assert.equal(author.data.email, 'test2@email.com');
    });

    it('Can remove author information', () => {
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

    it('Will throw on string value that is too long', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });
        const longName = 'a'.repeat(192);

        assert.throws(() => author.set('name', longName), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(AuthorContext) Value for "name" is too long. Currently 192 characters, Max 191.'
        });
    });

    it('Will throw on invalid choice value', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        assert.throws(() => author.set('role', 'SuperAdmin'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(AuthorContext) Invalid choice for "role"'
        });
    });

    it('Includes the failing value as context in validation errors', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        try {
            author.set('email', 'notanemail');
            assert.fail('Expected an error');
        } catch (err: any) {
            assert.equal(err.context, 'notanemail');
        }
    });

    it('Will throw on unknown property', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });

        assert.throws(() => author.set('nonexistent', 'value'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(AuthorContext) Property "nonexistent" is not allowed in AuthorContext'
        });
    });

    it('Will throw on an invalid email address', () => {
        const thisIs80Chars = 'this-string-is-80-chars-long-lorem-ipsum-dolor-sit-amet-consectetur-adipiscing-el';

        const author = new AuthorContext({
            name: 'Test',
            slug: 'test',
            website: 'https://test.com'
        });

        assert.throws(() => author.set('email', `${thisIs80Chars}@email.com`), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(AuthorContext) Invalid email address for "email"'
        });
    });

    it('Will throw on email with empty local part', () => {
        const author = new AuthorContext({
            name: 'Test',
            slug: 'test'
        });

        assert.throws(() => author.set('email', '@example.com'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(AuthorContext) Invalid email address for "email"'
        });
    });

    it('Will throw on email with no @ sign', () => {
        const author = new AuthorContext({
            name: 'Test',
            slug: 'test'
        });

        assert.throws(() => author.set('email', 'notanemail'), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(AuthorContext) Invalid email address for "email"'
        });
    });

    it('Will throw on email with local part exceeding 64 characters', () => {
        const local65 = 'a'.repeat(65);

        const author = new AuthorContext({
            name: 'Test',
            slug: 'test'
        });

        assert.throws(() => author.set('email', `${local65}@example.com`), {
            name: 'InternalServerError',
            statusCode: 500,
            message: '(AuthorContext) Invalid email address for "email"'
        });
    });
});
