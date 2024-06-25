/**
 * Given a path to a file of the WordPress users table HTML, parse that into a JSON file than can be passed to the CLI tool as `--users /path/to/users.json`
 *
 * `cd` into the `packages/mg-wp-api/utils` directory and run `node users-html-to-json.js /path/to/users.html`
 * `users.json` will be saved to the same location as the HTML file came from
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import $ from 'cheerio';
import {slugify} from '@tryghost/string';

if (!process.argv[2]) {
    console.error('Please provide a path to the file'); // eslint-disable-line no-console
    process.exit(1);
}

const desitnationDir = dirname(process.argv[2]);
const destPath = join(desitnationDir, 'users.json');

const html = readFileSync(process.argv[2], 'utf8');

const $html = $.load(html);

let users = [];

$html('tr[id^="user-"]').each((i, el) => {
    const postCount = parseInt($html(el).find('[data-colname="Posts"]').text().trim());

    if (postCount === 0) {
        return;
    }

    let id = parseInt($html(el).attr('id').replace('user-', ''));
    let email = $html(el).find('[data-colname="Email"]').text().trim();
    let name = $html(el).find('[data-colname="Name"]').text().trim();
    let username = $html(el).find('[data-colname="Username"]').find('strong').text().trim();
    let image = $html(el).find('[data-colname="Username"]').find('img').attr('src').trim().replace('s=64', 's=500');

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
});

writeFileSync(destPath, JSON.stringify(users, null, 4));
console.log(`✅ File saved to: ${destPath}`); // eslint-disable-line no-console
