import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {execSync} from 'node:child_process';
import {describe, it, before, after} from 'node:test';
import nock from 'nock';
import substackSource from '../sources/substack.js';

// Smallest valid JPEG: a 1x1 red pixel
const JPEG_BUFFER = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM' +
    'DhEQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQU' +
    'FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf' +
    '/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=',
    'base64'
);

const CSV_CONTENT = `post_id,post_date,is_published,email_sent_at,type,audience,title,subtitle,podcast_url
123401.plain-text,2024-01-15T10:00:00.000Z,TRUE,2024-01-15T10:00:00.000Z,newsletter,everyone,Plain Text,A test subtitle,
123404.draft-text,2024-01-16T10:00:00.000Z,FALSE,,newsletter,everyone,Draft Post,A draft subtitle,
`;

const PUBLISHED_POST_HTML = `<h2>Hello World</h2>
<p>This is a test post with an image.</p>
<img src="https://substack-post-media.s3.amazonaws.com/public/images/test-image.jpg" alt="Test image">
<p class="button-wrapper" data-attrs='{"url":"https://example.substack.com/subscribe?","text":"Subscribe","class":null}'>
    <a class="button primary" href="https://example.substack.com/subscribe?"><span>Subscribe</span></a>
</p>
<p>End of post.</p>
`;

const DRAFT_POST_HTML = `<h2>Draft Post</h2>
<p>This is a draft post.</p>
`;

describe('Substack E2E Migration', function () {
    let ghostImport;
    let outputDir;
    let fixtureDir;
    let zipPath;
    let nockAssetImage;
    let nockAssetOgImage;

    before(async function () {
        // Load the scrape fixture HTML
        const scrapeFixtureHTML = await readFile(
            new URL('./fixtures/substack-e2e-scrape.html', import.meta.url)
        );

        // Create temp directory with Substack export structure
        fixtureDir = join(
            new URL('.', import.meta.url).pathname,
            'fixtures',
            'substack-e2e-tmp'
        );
        const postsDir = join(fixtureDir, 'posts');
        mkdirSync(postsDir, {recursive: true});

        writeFileSync(join(fixtureDir, 'posts.csv'), CSV_CONTENT);
        writeFileSync(join(postsDir, '123401.plain-text.html'), PUBLISHED_POST_HTML);
        writeFileSync(join(postsDir, '123404.draft-text.html'), DRAFT_POST_HTML);

        // Create the input ZIP
        zipPath = join(fixtureDir, '..', 'substack-e2e.zip');
        execSync(`zip -r "${zipPath}" posts.csv posts/`, {
            cwd: fixtureDir
        });

        // Create a temp directory for the output ZIP
        outputDir = join(fixtureDir, '..', 'substack-e2e-output');
        mkdirSync(outputDir, {recursive: true});

        // Disable all real HTTP
        nock.disableNetConnect();

        // Mock web scraper request for published post
        nock('https://example.substack.com')
            .get('/p/plain-text')
            .reply(200, scrapeFixtureHTML, {
                'Content-Type': 'text/html'
            });

        // Mock asset scraper requests for images
        nockAssetImage = nock('https://substack-post-media.s3.amazonaws.com')
            .get('/public/images/test-image.jpg')
            .reply(200, JPEG_BUFFER, {
                'Content-Type': 'image/jpeg'
            });

        nockAssetOgImage = nock('https://substack-post-media.s3.amazonaws.com')
            .get('/public/images/og-image.jpg')
            .reply(200, JPEG_BUFFER, {
                'Content-Type': 'image/jpeg'
            });

        // Run the full migration pipeline with zip enabled
        const options = {
            pathToZip: zipPath,
            url: 'https://example.substack.com',
            scrape: ['all'],
            wait_after_scrape: 0,
            zip: true,
            cache: false,
            verbose: false,
            renderer: 'silent',
            posts: true,
            drafts: true,
            pages: true,
            podcasts: true,
            threads: false,
            useMetaImage: true,
            useFirstImage: true,
            useMetaAuthor: true,
            addPlatformTag: true,
            addTypeTag: true,
            addAccessTag: true,
            addTag: null,
            subscribeLink: '#/portal/signup',
            noSubscribeButtons: false,
            comments: true,
            commentLink: '#ghost-comments-root',
            fallBackHTMLCard: true,
            postsBefore: null,
            postsAfter: null,
            email: null,
            tmpPath: null,
            outputPath: outputDir
        };

        const ctx = {
            errors: []
        };

        const migrate = substackSource.getTaskRunner(options);
        await migrate.run(ctx);

        // Unzip the output
        assert.ok(ctx.outputFile, 'should have produced an output file');
        assert.ok(existsSync(ctx.outputFile.path), `output zip should exist at ${ctx.outputFile.path}`);

        const unzipDir = join(outputDir, 'unzipped');
        mkdirSync(unzipDir, {recursive: true});
        execSync(`unzip -o "${ctx.outputFile.path}" -d "${unzipDir}"`);

        // Read the Ghost import JSON from the unzipped output
        const jsonPath = join(unzipDir, 'ghost-import.json');
        assert.ok(existsSync(jsonPath), `ghost-import.json should exist at ${jsonPath}`);
        ghostImport = JSON.parse(readFileSync(jsonPath, 'utf8'));
    });

    after(function () {
        nock.cleanAll();
        nock.enableNetConnect();

        // Clean up all temp files
        rmSync(fixtureDir, {recursive: true, force: true});
        rmSync(zipPath, {force: true});
        rmSync(outputDir, {recursive: true, force: true});
    });

    it('produces valid Ghost JSON with expected post count', function () {
        assert.ok(ghostImport);
        assert.ok(ghostImport.data);
        assert.ok(ghostImport.data.posts);
        assert.equal(ghostImport.data.posts.length, 2);
    });

    it('has correct post metadata', function () {
        const posts = ghostImport.data.posts;

        const published = posts.find(p => p.slug === 'plain-text');
        assert.ok(published, 'published post should exist');
        assert.equal(published.title, 'Plain Text');
        assert.equal(published.slug, 'plain-text');
        assert.equal(published.status, 'published');
        assert.equal(published.visibility, 'public');

        const draft = posts.find(p => p.slug === 'draft-text');
        assert.ok(draft, 'draft post should exist');
        assert.equal(draft.status, 'draft');
    });

    it('includes web-scraped metadata on the published post', function () {
        const published = ghostImport.data.posts.find(p => p.slug === 'plain-text');
        const postMeta = ghostImport.data.posts_meta.find(m => m.post_id === published.id);

        assert.ok(postMeta, 'published post should have posts_meta entry');
        assert.equal(postMeta.meta_title, 'Plain Text - Test Author');
        assert.equal(postMeta.meta_description, 'A test meta description');
        assert.equal(postMeta.og_image, '__GHOST_URL__/content/images/substack-post-media-s3-amazonaws-com/public/images/og-image.jpg');
        assert.equal(postMeta.og_title, 'Plain Text OG Title');
        assert.equal(postMeta.og_description, 'OG description for the post');
        assert.equal(postMeta.twitter_image, '__GHOST_URL__/content/images/substack-post-media-s3-amazonaws-com/public/images/og-image.jpg');
        assert.equal(postMeta.twitter_title, 'Plain Text Twitter Title');
        assert.equal(postMeta.twitter_description, 'Twitter description for the post');

        // Draft should not have scraped metadata
        const draft = ghostImport.data.posts.find(p => p.slug === 'draft-text');
        const draftMeta = ghostImport.data.posts_meta.find(m => m.post_id === draft.id);
        assert.ok(!draftMeta || !draftMeta.meta_title);
    });

    it('extracts authors from ld+json', function () {
        const published = ghostImport.data.posts.find(p => p.slug === 'plain-text');
        const postAuthors = ghostImport.data.posts_authors.filter(pa => pa.post_id === published.id);
        const users = ghostImport.data.users;

        assert.equal(postAuthors.length, 1);

        const authorIds = postAuthors.map(pa => pa.author_id);
        const postUsers = users.filter(u => authorIds.includes(u.id));

        assert.equal(postUsers.length, 1);
        assert.equal(postUsers[0].slug, 'test-author');
        assert.equal(postUsers[0].name, 'Test Author');
        assert.equal(postUsers[0].email, 'test-author@example.com');
    });

    it('extracts tags from scripts and adds platform/type/access tags', function () {
        const published = ghostImport.data.posts.find(p => p.slug === 'plain-text');
        const postTags = ghostImport.data.posts_tags.filter(pt => pt.post_id === published.id);
        const allTags = ghostImport.data.tags;

        const tagIds = postTags.map(pt => pt.tag_id);
        const tagNames = allTags.filter(t => tagIds.includes(t.id)).map(t => t.name);

        assert.deepEqual(tagNames, [
            'Tech', // section tag from _analyticsConfig
            'Testing', // post tag from _preloads
            'Newsletter', // type tag from CSV
            '#substack', // platform tag
            '#substack-type-newsletter', // type tag
            '#substack-access-everyone' // access tag
        ]);
    });

    it('converts HTML to valid Lexical JSON', function () {
        const published = ghostImport.data.posts.find(p => p.slug === 'plain-text');
        const lexical = JSON.parse(published.lexical);

        assert.deepEqual(lexical, {
            root: {
                children: [
                    {
                        children: [{detail: 0, format: 0, mode: 'normal', style: '', text: 'Hello World', type: 'extended-text', version: 1}],
                        direction: null, format: '', indent: 0, type: 'extended-heading', version: 1, tag: 'h2'
                    },
                    {
                        children: [{detail: 0, format: 0, mode: 'normal', style: '', text: 'This is a test post with an image.', type: 'extended-text', version: 1}],
                        direction: null, format: '', indent: 0, type: 'paragraph', version: 1
                    },
                    {
                        type: 'image', version: 1,
                        src: '__GHOST_URL__/content/images/substack-post-media-s3-amazonaws-com/public/images/test-image.jpg',
                        width: null, height: null, title: '', alt: 'Test image', caption: '', cardWidth: 'regular', href: ''
                    },
                    {
                        type: 'button', version: 1,
                        buttonText: 'Subscribe', alignment: 'center', buttonUrl: '#/portal/signup'
                    },
                    {
                        children: [{detail: 0, format: 0, mode: 'normal', style: '', text: 'End of post.', type: 'extended-text', version: 1}],
                        direction: null, format: '', indent: 0, type: 'paragraph', version: 1
                    }
                ],
                direction: null, format: '', indent: 0, type: 'root', version: 1
            }
        });
    });

    it('downloads assets and includes them in the output zip', function () {
        // Verify nock mocks were called
        assert.ok(nockAssetImage.isDone(), 'test-image.jpg should have been fetched');
        assert.ok(nockAssetOgImage.isDone(), 'og-image.jpg should have been fetched');

        // Check that image files exist in the unzipped output
        const unzipDir = join(outputDir, 'unzipped');
        const imagePath = join(unzipDir, 'content', 'images', 'substack-post-media-s3-amazonaws-com', 'public', 'images', 'test-image.jpg');
        const ogImagePath = join(unzipDir, 'content', 'images', 'substack-post-media-s3-amazonaws-com', 'public', 'images', 'og-image.jpg');

        assert.ok(existsSync(imagePath), `test-image.jpg should exist in unzipped output at ${imagePath}`);
        assert.ok(existsSync(ogImagePath), `og-image.jpg should exist in unzipped output at ${ogImagePath}`);
    });

    it('processes subscribe buttons', function () {
        const published = ghostImport.data.posts.find(p => p.slug === 'plain-text');

        // The original subscribe button URL should have been replaced
        assert.ok(
            !published.lexical.includes('https://example.substack.com/subscribe?'),
            'subscribe button URL should be rewritten'
        );
    });
});
