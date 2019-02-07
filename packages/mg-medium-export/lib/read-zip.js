const fsUtils = require('@tryghost/mg-fs-utils');

module.exports = (zipPath) => {
    let content = {
        posts: []
    };

    fsUtils.zip.read(zipPath, (zipEntry) => {
        if (/profile\/profile\.html/.test(zipEntry.entryName)) {
            content.profile = zipEntry.getData().toString('utf8');
        }

        if (/posts\/.*\.html$/.test(zipEntry.entryName)) {
            content.posts.push({
                name: zipEntry.name,
                html: zipEntry.getData().toString('utf8')
            });
        } else if (/[^/].*\.html$/.test(zipEntry.entryName)) {
            content.posts.push({
                name: zipEntry.name,
                html: zipEntry.getData().toString('utf8')
            });
        }
    });

    return content;
};
