import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import {stringUtils} from '@tryghost/mg-utils';
import {ingest, map, parseGuestAuthors, readGuestAuthors, processCoAuthors} from '../index.js';
import {SITE, wordpress, post, user, term, memoryContext, reset} from './helpers.js';

const FIXTURE = fileURLToPath(new URL('../../src/test/fixtures/guest-authors.xml', import.meta.url));

describe('Co-Authors Plus guest authors', function () {
    beforeEach(() => nock.disableNetConnect());
    afterEach(reset);

    it('reads guest author profiles keyed by their cap- slug', async function () {
        const guestAuthors = await readGuestAuthors(FIXTURE);

        assert.deepEqual([...guestAuthors.keys()], ['cap-janedoe', 'cap-wire-service', 'cap-nameless']);
        // The post title is the name, not the display name meta
        assert.deepEqual(guestAuthors.get('cap-janedoe'), {
            data: {
                slug: 'janedoe',
                name: 'Jane Doe',
                email: 'jane@example.com',
                bio: 'Jane writes about Ærø & København.',
                website: 'https://jane.example.com',
                profile_image: 'https://example.com/wp-content/uploads/2024/01/jane.jpg'
            }
        });
        // Without a title or login: display name and post name; empty email, invalid website, missing image dropped
        assert.deepEqual(guestAuthors.get('cap-wire-service'), {data: {slug: 'wire-service', name: 'Wire Service'}});
        assert.deepEqual(guestAuthors.get('cap-nameless'), {data: {slug: 'nameless', name: 'nameless'}});
    });

    it('reads an export without items', async function () {
        assert.equal((await parseGuestAuthors('<rss><channel></channel></rss>')).size, 0);
        assert.equal((await parseGuestAuthors('<root/>')).size, 0);
    });

    it('uses guest profiles for unmatched author terms', async function () {
        const guestAuthors = await readGuestAuthors(FIXTURE);
        const wpTerms = [
            [
                term('author', 40, 'cap-janedoe', 'janedoe'),
                term('author', 41, 'cap-unknown', 'Unknown'),
                term('author', 42, 'alice', 'alice'),
                term('author', 43, 'cap-bob', 'bob@example.com')
            ]
        ];
        const users = [
            {url: `${SITE}/author/alice/`, data: {id: 1, slug: 'alice', name: 'Alice'}},
            {url: `${SITE}/author/bob/`, data: {id: 2, slug: 'bob', name: 'Bob'}}
        ];

        const coAuthors = processCoAuthors(wpTerms, users, guestAuthors);

        assert.deepEqual(
            coAuthors.map(author => [author.url, author.data.slug, author.data.name]),
            [
                [`${SITE}/author/cap-janedoe/`, 'janedoe', 'Jane Doe'],
                [`${SITE}/author/cap-unknown/`, 'cap-unknown', 'Unknown'],
                [`${SITE}/author/alice/`, 'alice', 'Alice'],
                // A `cap-` term for a WordPress user resolves to that user
                [`${SITE}/author/bob/`, 'bob', 'Bob']
            ]
        );
        // The shared profile is copied, not handed out
        assert.notEqual(coAuthors[0].data, guestAuthors.get('cap-janedoe')!.data);
    });

    it('maps cap- terms for WordPress users to the stored user', async function () {
        wordpress({
            users: [user(1, 'admin'), user(2, 'bencphpost-dk')],
            posts: [post(1, {_embedded: {'wp:term': [[term('author', 40, 'cap-bencphpost-dk', 'ben@cphpost.dk')]]}})]
        });
        const context = await memoryContext();
        try {
            await ingest(SITE, context);
            await map({}, context);
            const [first] = await context.getAllPosts();
            assert.deepEqual(
                first.data.authors.map((author: any) => [author.data.slug, author.data.name]),
                [['bencphpost-dk', 'BENCPHPOST-DK']]
            );
        } finally {
            await context.close();
        }
    });

    it('maps posts to guest authors from the --coAuthors file', async function () {
        wordpress({
            users: [user(1, 'admin')],
            posts: [
                post(1, {_embedded: {'wp:term': [[term('author', 40, 'cap-janedoe', 'janedoe')]]}}),
                post(2, {
                    _embedded: {
                        'wp:term': [
                            [term('author', 40, 'cap-janedoe', 'janedoe'), term('author', 41, 'cap-wire-service', 'x')]
                        ]
                    }
                })
            ]
        });
        const context = await memoryContext();
        try {
            await ingest(SITE, context);
            await map({coAuthors: FIXTURE}, context);
            const [first, second] = await context.getAllPosts();

            assert.equal(first.data.authors[0].data.name, 'Jane Doe');
            assert.equal(first.data.authors[0].data.slug, 'janedoe');
            assert.equal(first.data.authors[0].data.email, 'jane@example.com');
            assert.equal(second.data.authors[0].dbId, first.data.authors[0].dbId);
            assert.equal(second.data.authors[1].data.name, 'Wire Service');
            assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/author/cap-janedoe/`)), '/author/janedoe/');

            // Without the file the term data is used as before
            await map({}, context);
            assert.equal((await context.getAllPosts())[0].data.authors[0].data.slug, 'cap-janedoe');
        } finally {
            await context.close();
        }
    });
});
