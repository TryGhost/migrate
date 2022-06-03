const fsUtils = require('@tryghost/mg-fs-utils');
const ui = require('@tryghost/pretty-cli').ui;

module.exports = (zipPath, options) => {
    let content = {
        posts: []
    };

    let skippedFileCount = 0;

    // We only support the current Jekyll export file structure:
    // - posts
    //   - 2020-10-27-my-post.md
    //   - 2021-05-19-2020-was-quite-a-year.md

    fsUtils.zip.read(zipPath, (entryName, zipEntry) => {
        // Catch all HTML files inside `profile/`
        if (/^posts\/.*\.md$/.test(entryName)) {
            content.posts.push({
                fileName: entryName,
                markdown: zipEntry.getData().toString('utf8')
            });

        // Skip if not matched above, and report skipped files if `--verbose`
        } else {
            if (options.verbose) {
                ui.log.info('Skipped: ' + entryName);
            }
            skippedFileCount += 1;
        }
    });

    ui.log.info('Skipped files: ' + skippedFileCount);

    return content;
};
