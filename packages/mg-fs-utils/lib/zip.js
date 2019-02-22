const AdmZip = require('adm-zip');
const path = require('path');

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

module.exports.write = (zipPath, contentFolder) => {
    const zip = new AdmZip();
    const outputPath = path.join(zipPath, `ghost-import-${Date.now()}.zip`);
    zip.addLocalFolder(contentFolder);
    zip.writeZip(outputPath);

    return outputPath;
};
