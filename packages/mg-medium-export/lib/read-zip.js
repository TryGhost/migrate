const AdmZip = require('adm-zip');

module.exports = (zipPath) => {
    let zip = AdmZip(zipPath);
    let content = {
        posts: []
    };

    zip.getEntries().forEach(function (zipEntry) {
        if (/__MACOSX/.test(zipEntry.entryName)) {
            return;
        }

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
