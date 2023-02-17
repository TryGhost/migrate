import fsUtils from '@tryghost/mg-fs-utils';
import {_base as debugFactory} from '@tryghost/debug';

const debug = debugFactory('migrate:substack:read-zip');

const contentStats = async (zipPath) => {
    const entries = await fsUtils.readZipEntries(zipPath);

    const posts = entries.filter(value => /posts\/.*\.html/.test(value)).length;

    return {
        posts: posts
    };
};

export default (zipPath) => {
    let content = {
        csv: null,
        posts: []
    };

    // We only support the current Substack export file structure:
    // - posts.csv
    // - posts
    //   - 1234.post-slug.html
    //   - 5678.another-slug.html

    fsUtils.zip.read(zipPath, (entryName, zipEntry) => {
        // Catch all HTML files inside `profile/`
        if (/^posts\/.*\.html$/.test(entryName)) {
            debug(`Found post HTML file ${entryName}`);
            content.posts.push({
                name: entryName.replace('posts/', ''),
                html: zipEntry.getData().toString('utf8')
            });

        // Skip if not matched above
        } else if (entryName === 'posts.csv') {
            debug(`Found posts CSV file ${entryName}`);
            content.csv = zipEntry.getData().toString('utf8');
        }
    });

    return content;
};

export {
    contentStats
};
