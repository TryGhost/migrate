/**
 * Given a path to a file of the WordPress users table HTML, parse that into a JSON file than can be passed to the CLI tool as `--users /path/to/users.json`
 *
 * `cd` into the `packages/mg-wp-api/utils` directory and run `node users-html-to-json.js /path/to/users.html`
 * `users.json` will be saved to the same location as the HTML file came from
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {domUtils} from '@tryghost/mg-utils';
import {slugify} from '@tryghost/string';

const {parseFragment} = domUtils;

if (!process.argv[2]) {
    console.error('Please provide a path to the file'); // eslint-disable-line no-console
    process.exit(1);
}

const desitnationDir = dirname(process.argv[2]);
const destPath = join(desitnationDir, 'users.json');

const html = readFileSync(process.argv[2], 'utf8');

const parsed = parseFragment(html);

let users = [];

for (const el of parsed.$('tr[id^="user-"]')) {
    const postsCell = el.querySelector('[data-colname="Posts"]');
    const postCount = parseInt(postsCell ? postsCell.textContent.trim() : '0');

    if (postCount === 0) {
        continue;
    }

    let id = parseInt(el.getAttribute('id').replace('user-', ''));
    const emailCell = el.querySelector('[data-colname="Email"]');
    let email = emailCell ? emailCell.textContent.trim() : '';
    const nameCell = el.querySelector('[data-colname="Name"]');
    let name = nameCell ? nameCell.textContent.trim() : '';
    const usernameCell = el.querySelector('[data-colname="Username"]');
    const usernameStrong = usernameCell ? usernameCell.querySelector('strong') : null;
    let username = usernameStrong ? usernameStrong.textContent.trim() : '';
    const usernameImg = usernameCell ? usernameCell.querySelector('img') : null;
    let image = usernameImg ? usernameImg.getAttribute('src').trim().replace('s=64', 's=500') : '';

    if (name.includes('—Unknown')) {
        name = username;
    }

    let slug = slugify(name);

    users.push({
        id,
        slug,
        name,
        email,
        avatar_urls: {
            96: image
        }
    });
}

writeFileSync(destPath, JSON.stringify(users, null, 4));
console.log(`✅ File saved to: ${destPath}`); // eslint-disable-line no-console
