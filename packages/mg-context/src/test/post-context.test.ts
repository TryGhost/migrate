import assert from 'node:assert/strict';
import {PostContext, TagContext, AuthorContext} from '../index.js';

describe('PostContext', function () {
    test('Is instance of PostContext', () => {
        const instance: any = new PostContext();

        assert.equal(instance instanceof PostContext, true);
    });

    test('Can set & get meta', () => {
        const instance: any = new PostContext();
        instance.setMeta({
            url: 'https://example.com'
        });

        assert.deepEqual(instance.meta, {
            url: 'https://example.com'
        });
    });

    test('Can get meta key', () => {
        const instance: any = new PostContext();
        instance.setMeta({
            url: 'https://example.com'
        });

        assert.equal(instance.getMetaValue('url'), 'https://example.com');
    });

    test('Can set & get source', () => {
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

    test('Can get source key', () => {
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
        test('Can add a post directly to post context', async () => {
            const instance: any = new PostContext();
            instance.set('title', 'My Post');
            instance.set('slug', 'my-post');

            assert.equal(instance.data.title, 'My Post');
            assert.equal(instance.data.slug, 'my-post');
        });

        test('Can get final object', function () {
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

    describe('Tag Handling', function () {
        test('Can add a tag directly to post context', async () => {
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

        test('Can push a tag to post context', async () => {
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

        test('Can silently ignore adding tag as an object if it exists already', async () => {
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

        test('Can silently ignore adding tag as TagContext if it exists already', async () => {
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

        test('Can reorder tags', function () {
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

        test('Can remove tag by slug', function () {
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

        test('Can set primary tag where tag already exists', function () {
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

        test('Can set primary tag where tag did not already exist', function () {
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
    });

    describe('Author Handling', function () {
        test('Can add a author directly to post context', async () => {
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

        test('Can push a author to post context', async () => {
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

        test('Can silently ignore adding author as as object if it exists already', async () => {
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

        test('Can silently ignore adding author as AuthorContext if it exists already', async () => {
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

        test('Can reorder authors', function () {
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

        test('Can remove author by slug', function () {
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

        test('Can set primary author where author already exists', function () {
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

        test('Can set primary author where author did not already exist', function () {
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
    });
});
