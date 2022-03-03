const AdmZip = require('adm-zip');
const {compress} = require('@tryghost/zip');
const path = require('path');
const _private = {};
const errors = require('@tryghost/errors');

_private.openZipForRead = (zipPath) => {
    return AdmZip(zipPath);
};

/**
 * Read a Zip File
 * - Flattens the structure if there's one top-level directory, so we only get the files inside
 * @TODO: Refactor to use @tryghost/zip to extract zip files and drop adm-zip dependency
 */
module.exports.read = (zipPath, callback) => {
    let zip;
    try {
        zip = _private.openZipForRead(zipPath);
    } catch (error) {
        throw new errors.InternalServerError({message: `Unable to read zip file ${zipPath}: ${error}`});
    }

    // Entries is cleaned first
    let entries = zip.getEntries().filter((entry) => {
        return !(entry.entryName.match(/^__MACOSX/) || entry.entryName.match(/\.DS_Store$/));
    });
    // If the first entry is a directory, and every entry starts with the same directory, we have a top level directory
    let firstEntry = entries[0];
    let hasTopLevelDir = firstEntry.isDirectory && entries.every(x => x.entryName.startsWith(firstEntry.entryName));

    // If we have a topLevelDirectory, remove it
    if (hasTopLevelDir) {
        entries.shift();
    }

    entries.forEach((zipEntry) => {
        // If we have a topLevelDirectory, remove reference to it from the entry name
        let entryName = hasTopLevelDir ? zipEntry.entryName.replace(firstEntry.entryName, '') : zipEntry.entryName;
        callback(entryName, zipEntry);
    });
};

module.exports.write = (zipPath, contentFolder, fileName) => {
    const outputPath = path.join(zipPath, fileName || `ghost-import-${Date.now()}.zip`);

    return compress(contentFolder, outputPath);
};

module.exports._private = _private;
