const fsUtils = require('@tryghost/mg-fs-utils');

module.exports = (zipPath) => {
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
            content.posts.push({
                name: entryName.replace('posts/', ''),
                html: zipEntry.getData().toString('utf8')
            });

        // Skip if not matched above, and report skipped files if `--verbose`
        } else if (entryName === 'posts.csv') {
            content.csv = zipEntry.getData().toString('utf8');
        }
    });

    return content;
};
