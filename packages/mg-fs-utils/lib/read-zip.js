import errors from '@tryghost/errors';
import fsZip from './zip.js';

const readZipEntries = async (zipPath = null) => {
    if (!zipPath) {
        throw new errors.InternalServerError({message: `No zip path provided ${zipPath}`});
    }

    let zipEntries = [];

    fsZip.read(zipPath, (entryName, zipEntry) => {
        zipEntries[entryName] = zipEntry;
    });

    let files = [];

    for (const entry of Object.entries(zipEntries)) {
        if ((entry[1].name.match(/^__MACOSX/) || entry[1].name.match(/\.DS_Store$/))) {
            continue;
        }

        if (entry && !entry[1].isDirectory) {
            files.push(entry[0]);
        }
    }

    return files;
};

export {
    readZipEntries
};
