import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import process from '../lib/process.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readFixture = (path) => {
    return readFileSync(join(__dirname, 'fixtures', 'export', path), {encoding: 'utf8'});
};

describe('Process Main', function () {
    it('Can process input with profile and posts', function () {
        const input = {
            profile: readFixture('profile/profile.html'),
            posts: [
                {name: '2018-08-11_blog-post-title-efefef121212.html', html: readFixture('posts/basic-post.html')}
            ]
        };

        const output = process(input, {addPlatformTag: true});

        assert.ok(output.users);
        assert.equal(output.users.length, 1);
        assert.equal(output.users[0].data.name, 'User Name');

        assert.ok(output.posts);
        assert.equal(output.posts.length, 1);
        assert.equal(output.posts[0].data.title, 'Basic Post Title');
    });

    it('Can process input with profiles key instead of profile', function () {
        const input = {
            profiles: readFixture('profile/profile.html'),
            posts: [
                {name: '2018-08-11_blog-post-title-efefef121212.html', html: readFixture('posts/basic-post.html')}
            ]
        };

        const output = process(input, {});

        assert.ok(output.users);
        assert.equal(output.users.length, 1);
    });

    it('Can process input without profile', function () {
        const input = {
            posts: [
                {name: '2018-08-11_blog-post-title-efefef121212.html', html: readFixture('posts/basic-post.html')}
            ]
        };

        const output = process(input, {});

        assert.equal(output.users, undefined);
        assert.ok(output.posts);
        assert.equal(output.posts.length, 1);
    });

    it('Can process input without posts', function () {
        const input = {
            profile: readFixture('profile/profile.html')
        };

        const output = process(input, {});

        assert.ok(output.users);
        assert.equal(output.posts, undefined);
    });

    it('Can process empty posts array', function () {
        const input = {
            posts: []
        };

        const output = process(input, {});

        assert.equal(output.posts, undefined);
    });

    it('Passes globalUser to posts when single user', function () {
        const input = {
            profile: readFixture('profile/profile.html'),
            posts: [
                {name: 'draft_blog-post-title-ababab121212.html', html: readFixture('posts/draft-post.html')}
            ]
        };

        const output = process(input, {});

        // Draft posts don't have .p-author, so globalUser should be used
        assert.ok(output.posts[0].data.author);
        assert.equal(output.posts[0].data.author.data.name, 'User Name');
    });
});
