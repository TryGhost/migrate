const fsUtils = require('@tryghost/mg-fs-utils');

module.exports = (zipPath) => {
    let content = {
        posts: []
    };

    // @TODO: ideally we want to support
    // 1. a direct medium export with a posts/ & profile/ folder
    // 2. a zip full of html files as posts
    // 3. a zip with a nested dir that is also full of html files
    // We should try to detect what we have, and output which type we're gonna try
    // Then, if the html can't be parsed as a post, we should throw a warning and skip ahead

    fsUtils.zip.read(zipPath, (zipEntry) => {
        // @TODO rework this to provide more info
        if (/^profile\/profile\.html/.test(zipEntry.entryName)) {
            content.profile = zipEntry.getData().toString('utf8');
        } else if (/^posts\/.*\.html$/.test(zipEntry.entryName)) {
            content.posts.push({
                name: zipEntry.name,
                html: zipEntry.getData().toString('utf8')
            });
        } else if (/^[^/]*?\.html$/.test(zipEntry.entryName)) {
            content.posts.push({
                name: zipEntry.name,
                html: zipEntry.getData().toString('utf8')
            });
        }
    });

    return content;
};
