import {join} from 'node:path';
import AdmZip from 'adm-zip';
import {ensureDirSync, remove, ensureFileSync} from 'fs-extra';
import zip from '@tryghost/zip';
import errors from '@tryghost/errors';

const _private = {};

_private.openZipForRead = (zipPath) => {
    return AdmZip(zipPath);
};

/**
 * Read a Zip File
 * - Flattens the structure if there's one top-level directory, so we only get the files inside
 */
const read = (zipPath, callback) => {
    let zip; // eslint-disable-line no-shadow
    try {
        zip = _private.openZipForRead(zipPath);
    } catch (error) {
        throw new errors.InternalServerError({message: `Unable to read zip file ${zipPath}: ${error}`});
    }

    // If the zip has one entry and its another zip, unzip & read that instead
    const preCheckEntries = zip.getEntries().filter((entry) => {
        return !(entry.entryName.match(/^__MACOSX/) || entry.entryName.match(/\.DS_Store$/));
    });

    if (preCheckEntries.length === 1 && preCheckEntries[0].entryName.includes('.zip')) {
        const childZipBuffer = preCheckEntries[0].getData();

        // Redeclare the results array, we don't want to lust parent zip files
        zip = _private.openZipForRead(childZipBuffer);
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

const write = async (zipPath, contentFolder, fileName) => {
    // Ensure the directory we want to write to exists
    ensureDirSync(zipPath);

    const outputPath = join(zipPath, fileName || `ghost-import-${Date.now()}.zip`);

    return await zip.compress(contentFolder, outputPath);
};

const deleteFile = async (fileToDelete) => {
    ensureFileSync(fileToDelete);

    return await remove(fileToDelete);
};

export default {
    read,
    write,
    _private,
    deleteFile
};
