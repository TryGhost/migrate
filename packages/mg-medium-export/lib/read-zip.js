const fsUtils = require('@tryghost/mg-fs-utils');

module.exports = (zipPath) => {
    let content = {
        posts: []
    };

    // We support
    // 1. a direct medium export with a posts/ & profile/ folder
    // 2. a zip full of html files as posts
    // 3. a zip with a single nested dir that is also full of html files
    fsUtils.zip.read(zipPath, (entryName, zipEntry) => {
        if (/^profile\/profile\.html/.test(entryName)) {
            content.profile = zipEntry.getData().toString('utf8');
        } else if (/^posts\/.*\.html$/.test(entryName)) {
            content.posts.push({
                name: entryName,
                html: zipEntry.getData().toString('utf8')
            });
        } else if (/^[^/]*?\.html$/.test(entryName)) {
            content.posts.push({
                name: entryName,
                html: zipEntry.getData().toString('utf8')
            });
        }
        // @TODO: report on skipped files?
    });

    return content;
};
