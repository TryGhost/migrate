import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {RecordDataError} from '@tryghost/mg-context';
import {
    articleTags,
    authorName,
    emailAuthor,
    newsletterUrl,
    personAuthor,
    processArticle,
    processNewsletter,
    processNewsletterContent,
    textOnly
} from '../index.js';
import {httpUrl, text} from '../lib/process.js';
import type {TinyNewsArticle, TinyNewsNewsletter} from '../index.js';
import {fixture} from './helpers.js';

const articlesFixture: TinyNewsArticle[] = await fixture('articles.json');
const pagesFixture: TinyNewsArticle[] = await fixture('pages.json');
const newslettersFixture: {data: {newsletter_editions: TinyNewsNewsletter[]}} = await fixture('newsletters.json');
const authorSingleFixture = await fixture('author-single.json');
const authorMultipleFixture = await fixture('author-multiple.json');

/** An article like the first fixture, with its first translation changed by `translation`. */
function article(values: Partial<TinyNewsArticle> = {}, translation: Record<string, unknown> = {}): TinyNewsArticle {
    const base = structuredClone(articlesFixture[0]);
    return {...base, ...values, translations: [{...base.translations![0], ...translation}]};
}

describe('processArticle', function () {
    it('Can process posts', function () {
        const processed = processArticle(articlesFixture[0], 'post');

        assert.equal(processed.url, 'https://demo-site.example.com/articles/testing/all-embeds-and-formatting');
        assert.deepEqual(processed.fields, {
            title: 'All embeds and Formatting',
            slug: 'all-embeds-and-formatting',
            type: 'post',
            status: 'published',
            visibility: 'public',
            html: '<p>Example text </p>',
            custom_excerpt: 'An article that shows Google Docs integration elements',
            og_title: 'FB Title - All Embeds and Formatting',
            og_description: 'FB desc - An article that shows Google Docs integration elements',
            twitter_title: 'TW Title - All Embeds and Formatting',
            twitter_description: 'TW desc - An article that shows Google Docs integration elements',
            meta_title: 'All embeds and Formatting',
            meta_description: 'An article that shows Google Docs integration elements',
            feature_image: 'https://assets.example.com/demo-site/all-embeds-and-formatting/imagekix.mpef3nc309qu.jpg',
            feature_image_alt: 'Featured image. Alt text is also the caption',
            feature_image_caption: 'Featured image. Alt text is also the caption'
        });
        assert.equal(processed.published!.toISOString(), '2023-03-24T19:45:24.257Z');
        assert.equal(processed.created, processed.published);
        assert.equal(processed.updated!.toISOString(), '2023-03-24T19:55:47.250Z');
        assert.deepEqual(processed.tags, [
            {name: 'test', slug: 'test'},
            {name: 'embeds', slug: 'embeds'},
            {name: 'Images', slug: 'images'},
            {name: 'Testing', slug: 'testing'},
            {name: '#tinynews', slug: 'hash-tinynews'}
        ]);
    });

    it('Trims titles and leaves blank fields and image alt text empty', function () {
        const processed = processArticle(articlesFixture[1], 'post');

        assert.equal(processed.fields.title, 'Images');
        assert.equal(processed.fields.og_title, null);
        assert.equal(processed.fields.twitter_description, null);
        assert.equal(
            processed.fields.feature_image,
            'https://assets.example.com/demo-site/images/imagekix.h4uzg1gckmrv.jpg'
        );
        assert.equal(processed.fields.feature_image_alt, null);
        assert.equal(processed.fields.feature_image_caption, null);
        assert.equal('feature_image' in processArticle(articlesFixture[2], 'post').fields, false);
    });

    it('Can process pages, taking the feature image from a mainImage block', function () {
        const processed = processArticle(pagesFixture[0], 'page');

        assert.equal(processed.fields.type, 'page');
        assert.equal(processed.fields.feature_image, 'https://assets.example.com/demo-site/about/team.jpg');
        assert.equal(processed.fields.html, '<h2>Who we are </h2><p>A small newsroom. </p>');
        assert.equal(processed.url, 'https://demo-site.example.com/about');
        assert.deepEqual(processed.tags, [{name: '#tinynews', slug: 'hash-tinynews'}]);

        const withMainImage = processArticle(
            {
                ...pagesFixture[0],
                translations: [
                    {...pagesFixture[0].translations![0], main_image: articlesFixture[0].translations![0]!.main_image}
                ]
            },
            'page'
        );
        assert.equal(withMainImage.fields.feature_image, 'https://assets.example.com/demo-site/about/team.jpg');
        assert.equal(withMainImage.fields.feature_image_alt, 'Featured image. Alt text is also the caption');

        const withoutImage = processArticle(
            {
                ...pagesFixture[0],
                translations: [{...pagesFixture[0].translations![0], content: [{type: 'mainImage', children: []}]}]
            },
            'page'
        );
        assert.equal('feature_image' in withoutImage.fields, false);
        assert.equal(
            processArticle(article({}, {content: 'Plain <b>HTML</b>'}), 'page').fields.html,
            'Plain <b>HTML</b>'
        );
    });

    it('Processes undated drafts and falls back for dates, slugs and titles', function () {
        const draft = processArticle(pagesFixture[1], 'page');
        assert.equal(draft.fields.status, 'draft');
        assert.equal(draft.published, null);
        assert.equal(draft.updated, null);
        assert.equal(draft.url, null);

        const updatedOnly = processArticle(article({}, {first_published_at: 'not a date'}), 'post');
        assert.equal(updatedOnly.published!.toISOString(), '2023-03-24T19:55:47.250Z');

        const untitled = processArticle(article({slug: ' '}, {headline: null, content: null}), 'post');
        assert.equal(untitled.fields.title, '(Untitled)');
        assert.equal(untitled.fields.slug, 'untitled');
        assert.equal(untitled.fields.html, '');
        assert.equal(processArticle(article({slug: null}, {headline: 'A Title'}), 'post').fields.slug, 'a-title');
    });

    it('Adds the Facebook SDK for Facebook posts', function () {
        const processed = processArticle(
            article(
                {},
                {content: [{type: 'embed', link: 'https://www.facebook.com/x', html: '<div class="fb-post"></div>'}]}
            ),
            'post'
        );

        assert.match(processed.fields.html, /class="fb-post"/);
        assert.match(processed.fields.codeinjection_head!, /connect\.facebook\.net/);
        assert.equal('codeinjection_head' in processArticle(articlesFixture[0], 'post').fields, false);
    });

    it('Passes content blocks it cannot convert to onUnhandled', function () {
        const reasons: string[] = [];
        processArticle(article({}, {content: [{type: 'table'}]}), 'post', {
            onUnhandled: reason => reasons.push(reason)
        });

        assert.deepEqual(reasons, ['Unhandled block type: table']);
    });

    it('Rejects an item without a translation', function () {
        assert.throws(
            () => processArticle({...articlesFixture[0], translations: []}, 'post'),
            (error: Error) => {
                assert.ok(error instanceof RecordDataError);
                assert.equal(error.message, 'Article has no translation');
                return true;
            }
        );
        assert.throws(
            () => processArticle({...articlesFixture[0], translations: null}, 'page'),
            /Page has no translation/
        );
        assert.throws(
            () => processArticle({...articlesFixture[0], translations: [null]}, 'post'),
            /Article has no translation/
        );
    });
});

describe('articleTags', function () {
    it('Makes unpublished categories and tags internal, after public tags', function () {
        const tags = articleTags({
            category: {slug: 'news', title: 'News', published: false},
            tags: [
                {tag: {slug: 'local', published: true, tag_translations: [{title: 'Local'}]}},
                {tag: {slug: 'hidden', published: false, tag_translations: [{title: 'Hidden'}]}},
                {tag: {slug: 'local', tag_translations: [{title: 'Local again'}]}},
                {tag: {slug: 'No Title', tag_translations: []}},
                {tag: {slug: null, tag_translations: [{title: 'Only A Title'}]}},
                {tag: {slug: ' ', tag_translations: [{title: ' '}]}},
                {tag: null},
                null
            ]
        });

        assert.deepEqual(tags, [
            {name: 'Local', slug: 'local'},
            {name: 'No Title', slug: 'no-title'},
            {name: 'Only A Title', slug: 'only-a-title'},
            {name: '#News', slug: 'hash-news'},
            {name: '#Hidden', slug: 'hash-hidden'},
            {name: '#tinynews', slug: 'hash-tinynews'}
        ]);
    });

    it('Has only #tinynews without a category or tags', function () {
        assert.deepEqual(articleTags({category: null}), [{name: '#tinynews', slug: 'hash-tinynews'}]);
    });
});

describe('processNewsletter', function () {
    it('Can process newsletters', function () {
        const processed = processNewsletter(
            newslettersFixture.data.newsletter_editions[0],
            'https://demo-site.example.com/'
        );

        assert.deepEqual(processed.fields, {
            title: 'Weekly roundup #1',
            slug: 'weekly-roundup-1',
            type: 'post',
            status: 'published',
            visibility: 'public',
            html: '<!--kg-card-begin: html--><h2>Top stories</h2><p>Story one</p><p>More text</p><!--kg-card-end: html-->',
            custom_excerpt: "The week's news"
        });
        assert.equal(processed.url, 'https://demo-site.example.com/newsletters/weekly-roundup-1');
        assert.equal(processed.published!.toISOString(), '2023-05-01T09:00:00.000Z');
        assert.equal(processed.updated, processed.published);
        assert.equal(processed.created!.toISOString(), '2023-04-30T15:00:00.000Z');
        assert.deepEqual(processed.tags, [
            {name: '#newsletter', slug: 'hash-newsletter'},
            {name: '#tinynews', slug: 'hash-tinynews'}
        ]);
    });

    it('Falls back for slugs, content and dates', function () {
        const processed = processNewsletter(
            {
                headline: 'No Slug',
                content: null,
                newsletter_published_at: null,
                newsletter_created_at: '2023-01-02 03:04:05'
            },
            'https://demo-site.example.com'
        );

        assert.equal(processed.fields.slug, 'no-slug');
        assert.equal(processed.fields.html, '');
        assert.equal(processed.fields.custom_excerpt, null);
        assert.equal(processed.url, null);
        assert.equal(processed.published!.toISOString(), '2023-01-02T03:04:05.000Z');
        assert.deepEqual(processed.created, processed.published);

        const undated = processNewsletter({}, 'https://demo-site.example.com');
        assert.equal(undated.fields.title, '(Untitled)');
        assert.equal(undated.published, null);
        assert.equal(undated.created, null);
    });

    it('Gives newsletters their URL on the live site', function () {
        assert.equal(
            newsletterUrl('https://example.com/news//', {slug: ' first '}),
            'https://example.com/news/newsletters/first'
        );
        assert.equal(newsletterUrl('https://example.com', {slug: ''}), null);
    });
});

describe('processNewsletterContent', function () {
    it('Keeps basic formatting and removes Letterhead links and empty paragraphs', function () {
        const html = processNewsletterContent(
            '<p>Text <img src="https://example.com/a.jpg" alt="A" onerror="x"><a href="https://example.com/empty"></a></p><p><br></p><p> </p><p><a href="https://letterhead.example">Made with Letterhead</a></p><script>alert(1)</script><span>Span</span>'
        );

        assert.equal(
            html,
            '<!--kg-card-begin: html--><p>Text <img src="https://example.com/a.jpg" alt="A"><a href="https://example.com/empty"></a></p>Span<!--kg-card-end: html-->'
        );
    });
});

describe('Authors', function () {
    it('Can read author info', function () {
        assert.deepEqual(personAuthor(authorSingleFixture.data.authors[0]), {
            key: 'email:lorem@ipsum.com',
            name: 'Lorem Ipsum',
            slug: 'lorem-ipsum',
            email: 'lorem@ipsum.com',
            profile_image: 'https://example.com/lorem.jpg',
            bio: 'Lorem ipsum dolor simet'
        });
    });

    it('Enriches author data if more is available in the authors file', function () {
        const nested = articlesFixture[0].author![0]!.author!;

        assert.deepEqual(personAuthor(nested), {
            key: 'name:Dolor Simet',
            name: 'Dolor Simet',
            slug: 'dolor-simet',
            email: null
        });
        assert.deepEqual(personAuthor(nested, authorMultipleFixture.data.authors[1]), {
            key: 'email:dolor@simet.com',
            name: 'Dolor Simet',
            slug: 'dolor-simet',
            email: 'dolor@simet.com',
            profile_image: 'https://example.com/dolor.jpg',
            bio: 'Lorem ipsum dolor simet'
        });
        assert.deepEqual(
            personAuthor(
                {
                    first_names: 'Ann',
                    last_name: null,
                    email: 'Ann@Example.com',
                    photoUrl: 'https://example.com/ann.jpg',
                    translations: [{bio: '<p>Writes <b>things</b></p>'}]
                },
                {first_names: 'Ann', email: ' ', translations: [{bio: '<p></p>'}]}
            ),
            {
                key: 'email:ann@example.com',
                name: 'Ann',
                slug: 'ann',
                email: 'Ann@Example.com',
                profile_image: 'https://example.com/ann.jpg',
                bio: 'Writes things'
            }
        );
        assert.equal(personAuthor({first_names: ' ', last_name: null}), null);
        assert.equal(authorName({last_name: 'Only'}), 'Only');
    });

    it('Names authors from created_by_email', function () {
        assert.deepEqual(emailAuthor('John.Doe@Example.com'), {
            key: 'email:john.doe@example.com',
            name: 'John.Doe',
            slug: 'john-doe',
            email: 'John.Doe@Example.com'
        });
        assert.equal(emailAuthor(''), null);
        assert.equal(emailAuthor('@example.com'), null);
        assert.equal(emailAuthor(null), null);
    });
});

describe('Helpers', function () {
    it('Reads text and URLs', function () {
        assert.equal(text('  a  '), 'a');
        assert.equal(text(' '), undefined);
        assert.equal(text(1), undefined);
        assert.equal(textOnly('<p>Some <em>text</em></p> '), 'Some text');
        assert.equal(httpUrl(' https://example.com/a '), 'https://example.com/a');
        assert.equal(httpUrl('ftp://example.com/a'), null);
        assert.equal(httpUrl('not a url'), null);
        assert.equal(httpUrl(null), null);
    });
});
