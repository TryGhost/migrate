import errors from '@tryghost/errors';
import StreamZip from 'node-stream-zip';

const readZipEntries = async (zipPath = null) => {
    if (!zipPath) {
        throw new errors.InternalServerError({message: `No zip path provided ${zipPath}`});
    }

    const zip = new StreamZip.async({file: zipPath});

    let files = [];

    const zipEntries = await zip.entries();

    for (const entry of Object.values(zipEntries)) {
        if ((entry.name.match(/^__MACOSX/) || entry.name.match(/\.DS_Store$/))) {
            continue;
        }

        if (entry && !entry.isDirectory) {
            files.push(entry.name);
        }
    }

    await zip.close();

    return files;
};

export {
    readZipEntries
};
