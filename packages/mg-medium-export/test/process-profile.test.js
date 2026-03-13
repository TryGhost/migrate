import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import processProfile from '../lib/process-profile.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = (name) => {
    let fixtureFileName = join(__dirname, './', 'fixtures', 'export', 'profile', name);
    return readFileSync(fixtureFileName, {encoding: 'utf8'});
};

describe('Process Profile', function () {
    it('Can process a profile', function () {
        const fixture = readSync('profile.html');
        const profile = processProfile({html: fixture});

        assert.equal(typeof profile, 'object');
        assert.ok(profile.url);
        assert.equal(profile.url, 'https://medium.com/@username');

        assert.equal(profile.data.name, 'User Name');
        assert.ok(profile.data.profile_image.includes('medium.com'));
        assert.deepEqual(profile.data.roles, ['Contributor']);

        assert.equal(profile.data.email, 'name@email.com');
        assert.equal(profile.data.created_at, '2014-01-20 5:19 pm');
        assert.equal(profile.data.twitter, '@username');
    });

    it('Can handle profile with no list items', function () {
        const html = `<!DOCTYPE html><html><body>
            <section class="h-card">
                <h3 class="p-name">Test User</h3>
                <img class="u-photo" src="https://example.com/photo.jpg">
                <a class="u-url" href="https://medium.com/@testuser">@testuser</a>
            </section>
        </body></html>`;

        const profile = processProfile({html});

        assert.equal(profile.data.name, 'Test User');
        assert.equal(profile.url, 'https://medium.com/@testuser');
    });

    it('Can handle profile with no name element', function () {
        const html = `<!DOCTYPE html><html><body>
            <section class="h-card">
                <img class="u-photo" src="https://example.com/photo.jpg">
                <a class="u-url" href="https://medium.com/@testuser">@testuser</a>
            </section>
        </body></html>`;

        const profile = processProfile({html});

        assert.equal(profile.data.name, '');
        assert.equal(profile.url, 'https://medium.com/@testuser');
    });

    it('Skips unknown profile fields', function () {
        const html = `<!DOCTYPE html><html><body>
            <section class="h-card">
                <h3 class="p-name">Test</h3>
                <img class="u-photo" src="https://example.com/photo.jpg">
                <a class="u-url" href="https://medium.com/@test">@test</a>
                <ul>
                    <li><b>Unknown field:</b> some value</li>
                    <li><b>Email address:</b> test@example.com</li>
                </ul>
            </section>
        </body></html>`;

        const profile = processProfile({html});

        assert.equal(profile.data.email, 'test@example.com');
        assert.equal(profile.data['unknown field'], undefined);
    });
});
