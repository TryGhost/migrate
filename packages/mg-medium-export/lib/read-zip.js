import {lstatSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import {_base as debugFactory} from '@tryghost/debug';

const debug = debugFactory('migrate:medium:lib:read-zip');

const contentStats = async (zipPath) => {
    const entries = await fsUtils.readZipEntries(zipPath);
    const posts = entries.filter(value => /^posts\/.*\.html$/.test(value)).length;
    const users = entries.filter(value => /^profile\/profile\.html/.test(value)).length;

    return {
        posts: posts,
        users: users
    };
};

const readMediumZip = ({content, zipPath, options, skippedFileCount}) => {
    const {removeResponses} = options;

    fsUtils.zip.read(zipPath, (entryName, zipEntry) => {
        const entryHtml = zipEntry.getData().toString('utf8');

        // Catch all HTML files inside `profile/`
        if (/^profile\/profile\.html/.test(entryName)) {
            content.profiles.push({data: entryHtml});

        // Catch all HTML files in `posts/`
        } else if (/^posts\/.*\.html$/.test(entryName)) {
            if (removeResponses && !entryHtml.includes('graf--title')) {
                return;
            }

            content.posts.push({
                name: entryName,
                html: entryHtml
            });
        // Skip if not matched above, and report skipped files if `--verbose`
        } else if (/.html$/.test(entryName)) {
            if (options.verbose) {
                debug(`Skipped: ${entryName}`);
            }
            skippedFileCount += 1;
        }
    });

    return {
        content,
        skippedFileCount
    };
};

export default (zipPath, options) => {
    let content = {
        profiles: [],
        posts: []
    };

    let skippedFileCount = 0;

    // We only support the current Medium export file structure:
    // - posts
    //   - the-post-name-b3h4k5l6b2u5.html
    //   - another-post-name-w9g8b5a4v6n8.html
    // - profile
    //   - file.html

    const ifIsDirectory = lstatSync(zipPath).isDirectory();

    if (ifIsDirectory) {
        readdirSync(zipPath).forEach((file) => {
            const filePath = join(zipPath, file);
            const zipContent = readMediumZip({content, zipPath: filePath, options, skippedFileCount});
            content = zipContent.content;
            skippedFileCount = zipContent.skippedFileCount;
        });
    } else {
        const zipContent = readMediumZip({content, zipPath, options, skippedFileCount});
        content = zipContent.content;
        skippedFileCount = zipContent.skippedFileCount;
    }

    debug(`Skipped files: ${skippedFileCount}`);

    return content;
};

export {
    contentStats
};
