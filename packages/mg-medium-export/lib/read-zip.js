import {lstatSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import {ui} from '@tryghost/pretty-cli';

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
    fsUtils.zip.read(zipPath, (entryName, zipEntry) => {
        // Catch all HTML files inside `profile/`
        if (/^profile\/profile\.html/.test(entryName)) {
            content.profiles.push({data: zipEntry.getData().toString('utf8')});

        // Catch all HTML files in `posts/`
        } else if (/^posts\/.*\.html$/.test(entryName)) {
            content.posts.push({
                name: entryName,
                html: zipEntry.getData().toString('utf8')
            });

        // Skip if not matched above, and report skipped files if `--verbose`
        } else if (/.html$/.test(entryName)) {
            if (options.verbose) {
                ui.log.info('Skipped: ' + entryName);
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

    ui.log.info('Skipped files: ' + skippedFileCount);

    return content;
};

export {
    contentStats
};
