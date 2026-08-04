import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import ghValidate from '@tryghost/validator';
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

    it('Truncates a string value that is too long', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@email.com'
        });
        const longName = 'a'.repeat(192);

        author.set('name', longName);

        assert.equal(author.data.name, 'a'.repeat(191));
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
        // The constructor bypasses set(), so the value reaches validate() unsanitized
        const longName = 'a'.repeat(192);
        const author: any = new AuthorContext({
            name: longName,
            slug: 'test',
            email: 'test@email.com'
        });

        try {
            const final = author.getFinal;
            assert.fail(`Expected an error, got ${JSON.stringify(final)}`);
        } catch (err: any) {
            assert.equal(err.context, longName);
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

    it('Replaces an email with too long a local part', () => {
        const thisIs80Chars = 'this-string-is-80-chars-long-lorem-ipsum-dolor-sit-amet-consectetur-adipiscing-el';

        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: `${thisIs80Chars}@email.com`,
            website: 'https://test.com'
        });

        author.sanitize();

        assert.equal(author.data.email, 'this-string-is-80-chars-long-lorem-ipsum-dolor-sit@example.com');
        assert.equal(ghValidate.isEmail(author.data.email), true);
    });

    it('Replaces an email with an empty local part', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: '@example.com'
        });

        author.sanitize();

        assert.equal(author.data.email, 'example@example.com');
    });

    it('Replaces an email with no @ sign', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'notanemail'
        });

        author.sanitize();

        assert.equal(author.data.email, 'notanemail@example.com');
    });

    it('Drops the bogus tail after the last dot when replacing an email', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'hello@world.com123'
        });

        author.sanitize();

        assert.equal(author.data.email, 'hello-world@example.com');
    });

    it('Falls back to the slug, then the name, when the email yields nothing', () => {
        const fromSlug: any = new AuthorContext({name: 'Jane Doe', slug: 'jane-doe', email: '...'});
        fromSlug.sanitize();
        assert.equal(fromSlug.data.email, 'jane-doe@example.com');

        const fromName: any = new AuthorContext({name: 'Jane Doe', slug: '', email: '...'});
        fromName.sanitize();
        assert.equal(fromName.data.email, 'jane-doe@example.com');

        const fromNothing: any = new AuthorContext({name: '', slug: '', email: '...'});
        fromNothing.sanitize();
        assert.equal(fromNothing.data.email, 'author@example.com');
    });

    it('Leaves a valid email alone', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'valid@example.com'
        });

        const collected: any[] = [];
        author.sanitize(collected);

        assert.equal(author.data.email, 'valid@example.com');
        assert.equal(collected.length, 0);
    });

    it('Drops a website that is not a URL', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@example.com',
            website: 'not a url'
        });

        const collected: any[] = [];
        author.sanitize(collected);

        assert.equal(author.data.website, null);
        assert.equal(collected.length, 1);
        assert.equal(collected[0].field, 'website');
        assert.equal(collected[0].reason, 'replaced');
    });

    it('Keeps a valid website', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@example.com',
            website: 'https://example.com'
        });

        author.sanitize();

        assert.equal(author.data.website, 'https://example.com');
    });

    it('Drops an over-long website rather than truncating it into a broken link', () => {
        const longUrl = `https://example.com/${'a'.repeat(2100)}`;
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@example.com',
            website: longUrl
        });
        const collected: any[] = [];

        author.sanitize(collected);

        assert.equal(author.data.website, null);
        assert.equal(collected.length, 1);
        assert.equal(collected[0].field, 'website');
        assert.equal(collected[0].reason, 'replaced');
        assert.equal(collected[0].oldValue, longUrl);
        assert.equal(collected[0].newValue, null);
    });

    it('Drops over-long profile and cover images', () => {
        const longUrl = `https://example.com/${'a'.repeat(2100)}.jpg`;
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@example.com',
            profile_image: longUrl,
            cover_image: longUrl
        });

        author.sanitize();

        assert.equal(author.data.profile_image, null);
        assert.equal(author.data.cover_image, null);
    });

    it('Keeps images and websites that are within the limit', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@example.com',
            profile_image: 'https://example.com/me.jpg',
            website: 'https://example.com'
        });
        const collected: any[] = [];

        author.sanitize(collected);

        assert.equal(author.data.profile_image, 'https://example.com/me.jpg');
        assert.equal(author.data.website, 'https://example.com');
        assert.equal(collected.length, 0);
    });

    it('Truncates an over-long bio and location', () => {
        const author: any = new AuthorContext({
            name: 'Test',
            slug: 'test',
            email: 'test@example.com',
            bio: 'b'.repeat(400),
            location: 'l'.repeat(300)
        });
        const collected: any[] = [];

        author.sanitize(collected);

        assert.equal(author.data.bio.length, 250);
        assert.equal(author.data.location.length, 150);
        assert.deepEqual(
            collected.map((c: any) => `${c.field}:${c.reason}`),
            ['bio:truncated', 'location:truncated']
        );
    });
});
