import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {PostContext, TagContext, AuthorContext} from '../index.js';

describe('PostContext', function () {
    it('Is instance of PostContext', () => {
        const instance: any = new PostContext();

        assert.equal(instance instanceof PostContext, true);
    });

    it('Can set & get meta', () => {
        const instance: any = new PostContext();
        instance.setMeta({
            url: 'https://example.com'
        });

        assert.deepEqual(instance.meta, {
            url: 'https://example.com'
        });
    });

    it('Can get meta key', () => {
        const instance: any = new PostContext();
        instance.setMeta({
            url: 'https://example.com'
        });

        assert.equal(instance.getMetaValue('url'), 'https://example.com');
    });

    it('Can set & get source', () => {
        const instance: any = new PostContext({
            source: {
                episode: 1234,
                id: 'abcd'
            }
        });

        assert.deepEqual(instance.source, {
            episode: 1234,
            id: 'abcd'
        });
    });

    it('Can get source key', () => {
        const instance: any = new PostContext({
            source: {
                episode: 1234,
                id: 'abcd'
            }
        });

        assert.equal(instance.getSourceValue('episode'), 1234);
        assert.equal(instance.getSourceValue('id'), 'abcd');
    });

    describe('Post Handling', function () {
        it('Can add a post directly to post context', async () => {
            const instance: any = new PostContext();
            instance.set('title', 'My Post');
            instance.set('slug', 'my-post');

            assert.equal(instance.data.title, 'My Post');
            assert.equal(instance.data.slug, 'my-post');
        });

        it('Default format is lexical', function () {
            const instance: any = new PostContext();
            instance.set('title', 'My Post');
            instance.set('slug', 'my-post');
            instance.set('html', '<p>Hello world</p>');
            instance.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            instance.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
            instance.set('published_at', new Date('2023-11-24T12:00:00.000Z'));

            const final = instance.getFinal;

            assert.equal(final.data.html, null);
            assert.equal(final.data.mobiledoc, null);
            assert.equal(typeof final.data.lexical, 'string');
            assert.ok(JSON.parse(final.data.lexical).root);
        });

        it('Can get final object', function () {
            const instance: any = new PostContext();
            instance.set('title', 'My Post');
            instance.set('slug', 'my-post');
            instance.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            instance.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
            instance.set('published_at', new Date('2023-11-24T12:00:00.000Z'));

            const final = instance.getFinal;

            assert.deepEqual(final, {
                data: {
                    title: 'My Post',
                    slug: 'my-post',
                    html: null,
                    mobiledoc: null,
                    lexical: null,
                    comment_id: null,
                    plaintext: null,
                    feature_image: null,
                    feature_image_alt: null,
                    feature_image_caption: null,
                    featured: false,
                    type: 'post',
                    status: 'draft',
                    visibility: 'public',
                    created_at: new Date('2023-11-24T12:00:00.000Z'),
                    updated_at: new Date('2023-11-24T12:00:00.000Z'),
                    published_at: new Date('2023-11-24T12:00:00.000Z'),
                    custom_excerpt: null,
                    codeinjection_head: null,
                    codeinjection_foot: null,
                    custom_template: null,
                    canonical_url: null,
                    og_image: null,
                    og_title: null,
                    og_description: null,
                    twitter_image: null,
                    twitter_title: null,
                    twitter_description: null,
                    meta_title: null,
                    meta_description: null,
                    tags: [],
                    authors: []
                }
            });
        });
    });

    it('getFinal converts to mobiledoc when contentFormat is mobiledoc', function () {
        const instance: any = new PostContext({contentFormat: 'mobiledoc'});
        instance.set('title', 'My Post');
        instance.set('slug', 'my-post');
        instance.set('html', '<p>Hello world</p>');
        instance.set('created_at', new Date('2023-11-24T12:00:00.000Z'));

        const final = instance.getFinal;

        assert.equal(final.data.html, null);
        assert.equal(final.data.lexical, null);
        assert.equal(typeof final.data.mobiledoc, 'string');
        assert.ok(JSON.parse(final.data.mobiledoc).version);
    });

    it('getFinal keeps html when contentFormat is html', function () {
        const instance: any = new PostContext({contentFormat: 'html'});
        instance.set('title', 'My Post');
        instance.set('slug', 'my-post');
        instance.set('html', '<p>Hello world</p>');
        instance.set('created_at', new Date('2023-11-24T12:00:00.000Z'));

        const final = instance.getFinal;

        assert.equal(final.data.html, '<p>Hello world</p>');
        assert.equal(final.data.lexical, null);
        assert.equal(final.data.mobiledoc, null);
    });

    it('getFinal includes unsaved tags and authors without ghostId', function () {
        const instance: any = new PostContext();
        instance.set('title', 'My Post');
        instance.set('slug', 'my-post');
        instance.set('created_at', new Date('2023-11-24T12:00:00.000Z'));

        instance.addTag({name: 'Tag One', slug: 'tag-one'});
        instance.addAuthor({name: 'Author One', slug: 'author-one', email: 'a@example.com'});

        const final = instance.getFinal;

        assert.equal(final.data.tags.length, 1);
        assert.equal(final.data.tags[0].data.slug, 'tag-one');
        assert.equal(final.data.authors.length, 1);
        assert.equal(final.data.authors[0].data.slug, 'author-one');
    });

    describe('Validation Errors', function () {
        it('Will throw on string value that is too long', () => {
            const instance: any = new PostContext();
            const longTitle = 'a'.repeat(256);

            assert.throws(() => instance.set('title', longTitle), {
                name: 'InternalServerError',
                statusCode: 500,
                message: '(PostContext) Value for "title" is too long. Currently 256 characters, Max 255.'
            });
        });

        it('Will throw on invalid date value', () => {
            const instance: any = new PostContext();

            assert.throws(() => instance.set('created_at', 'not-a-date'), {
                name: 'InternalServerError',
                statusCode: 500,
                message: '(PostContext) Invalid date value for "created_at"'
            });
        });

        it('Will throw on invalid choice value', () => {
            const instance: any = new PostContext();

            assert.throws(() => instance.set('status', 'archived'), {
                name: 'InternalServerError',
                statusCode: 500,
                message: '(PostContext) Invalid choice for "status"'
            });
        });

        it('Will throw on invalid boolean value', () => {
            const instance: any = new PostContext();

            assert.throws(() => instance.set('featured', 'yes'), {
                name: 'InternalServerError',
                statusCode: 500,
                message: '(PostContext) Invalid boolean value for "featured"'
            });
        });

        it('Includes the failing value as context in validation errors', () => {
            const instance: any = new PostContext();

            try {
                instance.set('created_at', 'not-a-date');
                assert.fail('Expected an error');
            } catch (err: any) {
                assert.equal(err.context, 'not-a-date');
            }
        });

        it('Will throw on unknown property', () => {
            const instance: any = new PostContext();

            assert.throws(() => instance.set('nonexistent', 'value'), {
                name: 'InternalServerError',
                statusCode: 500,
                message: '(PostContext) Property "nonexistent" is not allowed in PostContext'
            });
        });
    });

    describe('Tag Handling', function () {
        it('Can add a tag directly to post context', async () => {
            const instance: any = new PostContext();
            instance.addTag({
                name: 'My Tag',
                slug: 'my-tag'
            });

            assert.equal(instance.data.tags instanceof Array, true);
            assert.equal(instance.data.tags[0] instanceof TagContext, true);
            assert.equal(instance.data.tags[0].data.name, 'My Tag');
            assert.equal(instance.data.tags[0].data.slug, 'my-tag');
        });

        it('Can push a tag to post context', async () => {
            const instance: any = new PostContext();
            const tag = new TagContext({
                name: 'My Tag',
                slug: 'my-tag'
            });

            instance.addTag(tag);

            assert.equal(instance.data.tags instanceof Array, true);
            assert.equal(instance.data.tags[0] instanceof TagContext, true);
            assert.equal(instance.data.tags[0].data.name, 'My Tag');
            assert.equal(instance.data.tags[0].data.slug, 'my-tag');
        });

        it('Can silently ignore adding tag as an object if it exists already', async () => {
            const instance: any = new PostContext();
            instance.addTag({
                name: 'My Tag',
                slug: 'my-tag'
            });
            instance.addTag({
                name: 'My Tag',
                slug: 'my-tag'
            });

            assert.equal(instance.data.tags instanceof Array, true);
            assert.equal(instance.data.tags[0] instanceof TagContext, true);
            assert.equal(instance.data.tags[0].data.name, 'My Tag');
            assert.equal(instance.data.tags[0].data.slug, 'my-tag');
            assert.equal(instance.data.tags.length, 1);
        });

        it('Can silently ignore adding tag as TagContext if it exists already', async () => {
            const instance: any = new PostContext();
            const tag = new TagContext({
                name: 'My Tag',
                slug: 'my-tag'
            });

            instance.addTag(tag);
            instance.addTag(tag);

            assert.equal(instance.data.tags instanceof Array, true);
            assert.equal(instance.data.tags[0] instanceof TagContext, true);
            assert.equal(instance.data.tags[0].data.name, 'My Tag');
            assert.equal(instance.data.tags[0].data.slug, 'my-tag');
            assert.equal(instance.data.tags.length, 1);
        });

        it('Can reorder tags', function () {
            const instance: any = new PostContext();
            instance.addTag({
                name: 'Second Tag',
                slug: 'second-tag'
            });
            instance.addTag({
                name: 'Third Tag',
                slug: 'third-tag'
            });
            instance.addTag({
                name: 'First Tag',
                slug: 'first-tag'
            });

            assert.equal(instance.data.tags[0].data.name, 'Second Tag');
            assert.equal(instance.data.tags[1].data.name, 'Third Tag');
            assert.equal(instance.data.tags[2].data.name, 'First Tag');

            instance.setTagOrder((tags: any) => {
                const targetTagIndex = tags.findIndex((el: any) => el.name === 'First Tag');
                const firstTag = tags.splice(targetTagIndex, 1)[0];

                tags.splice(0, 0, firstTag);

                return tags;
            });

            assert.equal(instance.data.tags[0].data.name, 'First Tag');
            assert.equal(instance.data.tags[1].data.name, 'Second Tag');
            assert.equal(instance.data.tags[2].data.name, 'Third Tag');
        });

        it('Can remove tag by slug', function () {
            const instance: any = new PostContext();
            instance.addTag({
                name: 'First Tag',
                slug: 'first-tag'
            });
            instance.addTag({
                name: 'Second Tag',
                slug: 'second-tag'
            });
            instance.addTag({
                name: 'Third Tag',
                slug: 'third-tag'
            });

            assert.equal(instance.data.tags[0].data.name, 'First Tag');
            assert.equal(instance.data.tags[1].data.name, 'Second Tag');
            assert.equal(instance.data.tags[2].data.name, 'Third Tag');

            instance.removeTag('second-tag');

            assert.equal(instance.data.tags[0].data.name, 'First Tag');
            assert.equal(instance.data.tags[1].data.name, 'Third Tag');
        });

        it('Can set primary tag where tag already exists', function () {
            const instance: any = new PostContext();
            instance.addTag({
                name: 'First Tag',
                slug: 'first-tag'
            });
            instance.addTag({
                name: 'Second Tag',
                slug: 'second-tag'
            });
            instance.setPrimaryTag({
                name: 'Second Tag',
                slug: 'second-tag'
            });

            assert.equal(instance.data.tags[0].data.name, 'Second Tag');
            assert.equal(instance.data.tags[1].data.name, 'First Tag');

            assert.equal(instance.data.tags.length, 2);
        });

        it('Can set primary tag where tag did not already exist', function () {
            const instance: any = new PostContext();
            instance.addTag({
                name: 'First Tag',
                slug: 'first-tag'
            });
            instance.addTag({
                name: 'Second Tag',
                slug: 'second-tag'
            });
            instance.setPrimaryTag({
                name: 'Primary Tag',
                slug: 'primary-tag'
            });

            assert.equal(instance.data.tags[0].data.name, 'Primary Tag');
            assert.equal(instance.data.tags[1].data.name, 'First Tag');
            assert.equal(instance.data.tags[2].data.name, 'Second Tag');
        });

        it('Can detect if post has tag slug', function () {
            const instance: any = new PostContext();
            instance.addTag({
                name: 'First Tag',
                slug: 'first-tag'
            });
            instance.addTag({
                name: 'Second Tag',
                slug: 'second-tag'
            });
            instance.setPrimaryTag({
                name: 'Primary Tag',
                slug: 'primary-tag'
            });

            assert.equal(instance.hasTagSlug('second-tag'), true);
            assert.equal(instance.hasTagSlug('not-a-tag'), false);
        });

        it('Can detect if post has tag name', function () {
            const instance: any = new PostContext();
            instance.addTag({
                name: 'First Tag',
                slug: 'first-tag'
            });
            instance.addTag({
                name: 'Second Tag',
                slug: 'second-tag'
            });
            instance.setPrimaryTag({
                name: 'Primary Tag',
                slug: 'primary-tag'
            });

            assert.equal(instance.hasTagName('Second Tag'), true);
            assert.equal(instance.hasTagName('Not a tag'), false);
        });
    });

    describe('Author Handling', function () {
        it('Can add a author directly to post context', async () => {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'My Name',
                slug: 'my-name',
                email: 'my@email.com'
            });

            assert.equal(instance.data.authors instanceof Array, true);
            assert.equal(instance.data.authors[0] instanceof AuthorContext, true);
            assert.equal(instance.data.authors[0].data.name, 'My Name');
            assert.equal(instance.data.authors[0].data.slug, 'my-name');
            assert.equal(instance.data.authors[0].data.email, 'my@email.com');
            assert.equal(instance.data.authors.length, 1);
        });

        it('Can push a author to post context', async () => {
            const instance: any = new PostContext();
            const author = new AuthorContext({
                name: 'My Name',
                slug: 'my-name',
                email: 'my@email.com'
            });
            instance.addAuthor(author);

            assert.equal(instance.data.authors instanceof Array, true);
            assert.equal(instance.data.authors[0] instanceof AuthorContext, true);
            assert.equal(instance.data.authors[0].data.name, 'My Name');
            assert.equal(instance.data.authors[0].data.slug, 'my-name');
            assert.equal(instance.data.authors[0].data.email, 'my@email.com');
            assert.equal(instance.data.authors.length, 1);
        });

        it('Can silently ignore adding author as as object if it exists already', async () => {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'My Author',
                slug: 'my-author'
            });
            instance.addAuthor({
                name: 'My Author',
                slug: 'my-author'
            });

            assert.equal(instance.data.authors instanceof Array, true);
            assert.equal(instance.data.authors[0] instanceof AuthorContext, true);
            assert.equal(instance.data.authors[0].data.name, 'My Author');
            assert.equal(instance.data.authors[0].data.slug, 'my-author');
            assert.equal(instance.data.authors.length, 1);
        });

        it('Can silently ignore adding author as AuthorContext if it exists already', async () => {
            const instance: any = new PostContext();
            const author = new AuthorContext({
                name: 'My Author',
                slug: 'my-author'
            });

            instance.addAuthor(author);
            instance.addAuthor(author);

            assert.equal(instance.data.authors instanceof Array, true);
            assert.equal(instance.data.authors[0] instanceof AuthorContext, true);
            assert.equal(instance.data.authors[0].data.name, 'My Author');
            assert.equal(instance.data.authors[0].data.slug, 'my-author');
            assert.equal(instance.data.authors.length, 1);
        });

        it('Can reorder authors', function () {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'Second Author',
                slug: 'second-author'
            });
            instance.addAuthor({
                name: 'Third Author',
                slug: 'third-author'
            });
            instance.addAuthor({
                name: 'First Author',
                slug: 'first-author'
            });

            assert.equal(instance.data.authors[0].data.name, 'Second Author');
            assert.equal(instance.data.authors[1].data.name, 'Third Author');
            assert.equal(instance.data.authors[2].data.name, 'First Author');

            instance.setAuthorOrder((authors: any) => {
                const targetAuthorIndex = authors.findIndex((el: any) => el.name === 'First Author');
                const firstAuthor = authors.splice(targetAuthorIndex, 1)[0];

                authors.splice(0, 0, firstAuthor);

                return authors;
            });

            assert.equal(instance.data.authors[0].data.name, 'First Author');
            assert.equal(instance.data.authors[1].data.name, 'Second Author');
            assert.equal(instance.data.authors[2].data.name, 'Third Author');
        });

        it('Can remove author by slug', function () {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'First Author',
                slug: 'first-author'
            });
            instance.addAuthor({
                name: 'Second Author',
                slug: 'second-author'
            });
            instance.addAuthor({
                name: 'Third Author',
                slug: 'third-author'
            });

            assert.equal(instance.data.authors[0].data.name, 'First Author');
            assert.equal(instance.data.authors[1].data.name, 'Second Author');
            assert.equal(instance.data.authors[2].data.name, 'Third Author');

            instance.removeAuthor('second-author');

            assert.equal(instance.data.authors[0].data.name, 'First Author');
            assert.equal(instance.data.authors[1].data.name, 'Third Author');
            assert.equal(instance.data.authors.length, 2);
        });

        it('Can set primary author where author already exists', function () {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'First Author',
                slug: 'first-author'
            });
            instance.addAuthor({
                name: 'Second Author',
                slug: 'second-author'
            });
            instance.setPrimaryAuthor({
                name: 'Second Author',
                slug: 'second-author'
            });

            assert.equal(instance.data.authors[0].data.name, 'Second Author');
            assert.equal(instance.data.authors[1].data.name, 'First Author');
            assert.equal(instance.data.authors.length, 2);
        });

        it('Can set primary author where author did not already exist', function () {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'First Author',
                slug: 'first-author'
            });
            instance.addAuthor({
                name: 'Second Author',
                slug: 'second-author'
            });
            instance.setPrimaryAuthor({
                name: 'Primary Author',
                slug: 'primary-author'
            });

            assert.equal(instance.data.authors[0].data.name, 'Primary Author');
            assert.equal(instance.data.authors[1].data.name, 'First Author');
            assert.equal(instance.data.authors[2].data.name, 'Second Author');
        });

        it('Can detect if post has author slug', function () {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'First Author',
                slug: 'first-author'
            });
            instance.addAuthor({
                name: 'Second Author',
                slug: 'second-author'
            });
            instance.setPrimaryAuthor({
                name: 'Primary Author',
                slug: 'primary-author'
            });

            assert.equal(instance.hasAuthorSlug('second-author'), true);
            assert.equal(instance.hasAuthorSlug('not-an-author'), false);
        });

        it('Can detect if post has author name', function () {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'First Author',
                slug: 'first-author'
            });
            instance.addAuthor({
                name: 'Second Author',
                slug: 'second-author'
            });
            instance.setPrimaryAuthor({
                name: 'Primary Author',
                slug: 'primary-author'
            });

            assert.equal(instance.hasAuthorName('Second Author'), true);
            assert.equal(instance.hasAuthorName('Not an author'), false);
        });

        it('Can detect if post has author email', function () {
            const instance: any = new PostContext();
            instance.addAuthor({
                name: 'First Author',
                slug: 'first-author',
                email: 'first-author@example.com'
            });
            instance.addAuthor({
                name: 'Second Author',
                slug: 'second-author',
                email: 'second-author@example.com'
            });
            instance.setPrimaryAuthor({
                name: 'Primary Author',
                slug: 'primary-author',
                email: 'primary-author@example.com'
            });

            assert.equal(instance.hasAuthorEmail('second-author@example.com'), true);
            assert.equal(instance.hasAuthorEmail('not-an-author@example.com'), false);
        });
    });

    describe('convertContent', () => {
        it('Converts HTML to lexical and clears dirty flag', () => {
            const post: any = new PostContext({contentFormat: 'lexical'});
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');

            assert.equal(post.htmlDirty, true);
            post.convertContent();
            assert.equal(post.htmlDirty, false);
            assert.ok(post.data.lexical);
            assert.equal(typeof post.data.lexical, 'string');
            assert.ok(JSON.parse(post.data.lexical).root);
        });

        it('Converts HTML to mobiledoc', () => {
            const post: any = new PostContext({contentFormat: 'mobiledoc'});
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');

            post.convertContent();
            assert.ok(post.data.mobiledoc);
            assert.ok(JSON.parse(post.data.mobiledoc).version);
            assert.equal(post.data.lexical, null);
        });

        it('Skips conversion when not dirty', () => {
            const post: any = new PostContext({contentFormat: 'lexical'});
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');

            post.convertContent();
            const firstLexical = post.data.lexical;

            // Second call is a no-op
            post.convertContent();
            assert.equal(post.data.lexical, firstLexical);
        });

        it('Re-converts when HTML changes after conversion', () => {
            const post: any = new PostContext({contentFormat: 'lexical'});
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');

            post.convertContent();
            const firstLexical = post.data.lexical;
            assert.equal(post.htmlDirty, false);

            post.set('html', '<p>Updated</p>');
            assert.equal(post.htmlDirty, true);

            post.convertContent();
            assert.notEqual(post.data.lexical, firstLexical);
        });

        it('Is a no-op for html contentFormat', () => {
            const post: any = new PostContext({contentFormat: 'html'});
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');

            post.convertContent();
            assert.equal(post.data.lexical, null);
            assert.equal(post.data.mobiledoc, null);
            assert.equal(post.data.html, '<p>Hello</p>');
        });

        it('Sets lexical to null when html is null', () => {
            const post: any = new PostContext({contentFormat: 'lexical'});
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));

            post.convertContent();
            assert.equal(post.data.lexical, null);
        });

        it('Sets mobiledoc to null when html is null', () => {
            const post: any = new PostContext({contentFormat: 'mobiledoc'});
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));

            post.convertContent();
            assert.equal(post.data.mobiledoc, null);
            assert.equal(post.data.lexical, null);
        });
    });

    describe('toGhostPost', () => {
        function mockRow(overrides: any = {}) {
            return {
                id: 1,
                data: JSON.stringify({title: 'Test', slug: 'test', html: '<p>Hello</p>', created_at: '2023-01-01T00:00:00.000Z'}),
                content_format: 'lexical',
                ghost_id: 'abc123',
                ...overrides
            };
        }

        it('Converts to lexical and strips tags/authors', () => {
            const row = mockRow({
                data: JSON.stringify({title: 'Test', slug: 'test', html: '<p>Hi</p>', tags: [{slug: 'a'}], authors: [{slug: 'b'}]})
            });
            const {post, meta} = PostContext.toGhostPost(row);

            assert.equal(post.id, 'abc123');
            assert.equal(post.html, null);
            assert.ok(post.lexical);
            assert.equal(post.tags, undefined);
            assert.equal(post.authors, undefined);
            assert.equal(meta, null);
        });

        it('Converts to mobiledoc format', () => {
            const row = mockRow({content_format: 'mobiledoc'});
            const {post} = PostContext.toGhostPost(row);

            assert.equal(post.html, null);
            assert.equal(post.lexical, null);
            assert.ok(post.mobiledoc);
        });

        it('Keeps html when format is html', () => {
            const row = mockRow({content_format: 'html'});
            const {post} = PostContext.toGhostPost(row);

            assert.equal(post.html, '<p>Hello</p>');
            assert.equal(post.lexical, null);
            assert.equal(post.mobiledoc, null);
        });

        it('Handles missing ghostId', () => {
            const row = mockRow({ghost_id: null});
            const {post} = PostContext.toGhostPost(row);

            assert.equal(post.id, undefined);
            assert.equal(post.title, 'Test');
        });

        it('Extracts meta fields into posts_meta', () => {
            const row = mockRow({
                data: JSON.stringify({
                    title: 'Test', slug: 'test',
                    og_title: 'OG Title', meta_description: 'Meta desc',
                    created_at: '2023-01-01T00:00:00.000Z'
                })
            });
            const {post, meta} = PostContext.toGhostPost(row);

            assert.equal(post.og_title, undefined);
            assert.equal(post.meta_description, undefined);
            assert.ok(meta);
            assert.equal(meta.post_id, 'abc123');
            assert.equal(meta.og_title, 'OG Title');
            assert.equal(meta.meta_description, 'Meta desc');
        });

        it('Uses pre-converted lexical and skips conversion', () => {
            const row = mockRow({
                data: JSON.stringify({
                    title: 'Test', slug: 'test',
                    html: '<p>Hello</p>',
                    lexical: '{"root":{"children":[],"type":"root"}}',
                    created_at: '2023-01-01T00:00:00.000Z'
                })
            });
            const {post} = PostContext.toGhostPost(row);

            // Should use the pre-converted lexical, not reconvert
            assert.equal(post.lexical, '{"root":{"children":[],"type":"root"}}');
            assert.equal(post.html, null);
        });

        it('Uses pre-converted mobiledoc and skips conversion', () => {
            const row = mockRow({
                content_format: 'mobiledoc',
                data: JSON.stringify({
                    title: 'Test', slug: 'test',
                    html: '<p>Hello</p>',
                    mobiledoc: '{"version":"0.3.1","atoms":[],"cards":[]}',
                    created_at: '2023-01-01T00:00:00.000Z'
                })
            });
            const {post} = PostContext.toGhostPost(row);

            assert.equal(post.mobiledoc, '{"version":"0.3.1","atoms":[],"cards":[]}');
            assert.equal(post.html, null);
        });

        it('Works with plain objects (raw: true)', () => {
            const row = {
                id: 6,
                data: JSON.stringify({title: 'Raw', slug: 'raw', created_at: '2023-01-01T00:00:00.000Z'}),
                content_format: 'lexical',
                ghost_id: 'raw123'
            };
            const {post} = PostContext.toGhostPost(row);

            assert.equal(post.id, 'raw123');
            assert.equal(post.title, 'Raw');
        });
    });
});
