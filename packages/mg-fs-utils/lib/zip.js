const AdmZip = require('adm-zip');

module.exports.read = (zipPath, callback) => {
    let zip = AdmZip(zipPath);

    zip.getEntries().forEach((zipEntry) => {
        // @TODO: expand this list of automatically ignored files
        if (/__MACOSX/.test(zipEntry.entryName)) {
            return;
        }

        callback(zipEntry);
    });
};
