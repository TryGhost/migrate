const fsUtils = require('@tryghost/mg-fs-utils');
const ui = require('@tryghost/pretty-cli').ui;

module.exports = (zipPath, options) => {
    let content = {
        posts: []
    };

    let skippedFileCount = 0;

    // We only support the current Medium export file structure:
    // - posts
    //   - the-post-name-b3h4k5l6b2u5.html
    //   - another-post-name-w9g8b5a4v6n8.html
    // - profile
    //   - file.html

    fsUtils.zip.read(zipPath, (entryName, zipEntry) => {
        // Catch all HTML files inside `profile/`
        if (/^profile\/profile\.html/.test(entryName)) {
            content.profile = zipEntry.getData().toString('utf8');

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

    ui.log.info('Skipped files: ' + skippedFileCount);

    return content;
};
