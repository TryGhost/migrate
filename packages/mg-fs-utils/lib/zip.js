import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWriteStream} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import AdmZip from 'adm-zip';
import yauzl from 'yauzl';
import {ensureDirSync, remove, ensureFileSync} from 'fs-extra';
import zip from '@tryghost/zip';
import errors from '@tryghost/errors';

const _private = {};

_private.openZipForRead = zipPath => {
    return AdmZip(zipPath);
};

const isJunk = name => /^__MACOSX(?:\/|$)/.test(name) || /(?:^|\/)\.DS_Store$/.test(name);

const openZip = async zipPath => {
    try {
        return await yauzl.openPromise(zipPath, {autoClose: false});
    } catch (error) {
        throw new errors.InternalServerError({message: `Unable to read zip file ${zipPath}: ${error}`});
    }
};

/**
 * Scan the central directory (names only, no file data) for the layout `read()` normalises:
 * a single top-level directory to strip, or a single nested zip to read instead.
 */
const scanLayout = async (zipfile, unwrap) => {
    let count = 0;
    let only = null;
    let prefix;
    for await (const entry of zipfile.eachEntry()) {
        const name = entry.fileName;
        if (isJunk(name)) {
            continue;
        }
        count += 1;
        only = count === 1 ? entry : null;
        const slash = name.indexOf('/');
        const directory = slash > 0 ? name.slice(0, slash + 1) : null;
        prefix = prefix === undefined || prefix === directory ? directory : null;
    }
    if (unwrap && only && /\.zip$/i.test(only.fileName)) {
        return {nested: only};
    }
    return {prefix: prefix ?? ''};
};

async function* readEntries(zipPath, filter, unwrap) {
    let layout;
    const scan = await openZip(zipPath);
    let nestedDir;
    try {
        layout = await scanLayout(scan, unwrap);
        if (layout.nested) {
            // A zip holding only another zip is read as that inner zip, extracted to a temporary file.
            nestedDir = await mkdtemp(join(tmpdir(), 'mg-fs-utils-zip-'));
            await pipeline(
                await scan.openReadStreamPromise(layout.nested),
                createWriteStream(join(nestedDir, 'nested.zip'))
            );
        }
    } finally {
        scan.close();
    }
    if (nestedDir) {
        try {
            yield* readEntries(join(nestedDir, 'nested.zip'), filter, false);
        } finally {
            await rm(nestedDir, {recursive: true, force: true});
        }
        return;
    }

    const zipfile = await openZip(zipPath);
    try {
        for await (const raw of zipfile.eachEntry()) {
            const name = raw.fileName.slice(layout.prefix.length);
            if (isJunk(raw.fileName) || !name) {
                continue;
            }
            const stream = () => zipfile.openReadStreamPromise(raw);
            const entry = {
                name,
                path: raw.fileName,
                isDirectory: raw.fileName.endsWith('/'),
                size: raw.uncompressedSize,
                stream,
                read: async () => {
                    const chunks = [];
                    for await (const chunk of await stream()) {
                        chunks.push(chunk);
                    }
                    return Buffer.concat(chunks);
                }
            };
            if (!filter || filter(entry)) {
                yield entry;
            }
        }
    } finally {
        zipfile.close();
    }
}

/**
 * Stream the entries of a zip one at a time, without expanding the archive in memory.
 *
 * Names are normalised much as `read()` does: `__MACOSX` and `.DS_Store` entries are skipped, a top-level
 * directory that holds every entry is removed from names (whether or not the archive lists the directory itself),
 * and a zip that holds only another zip is read as that inner zip.
 * Each entry is `{name, path, isDirectory, size, read(), stream()}`, where `path` is the unmodified name in the
 * archive, `read()` resolves to the entry's contents as a Buffer and `stream()` to a Readable of them. Call
 * `read()` or `stream()` before the iteration finishes; the archive is closed when it does.
 *
 * @param {String} zipPath - path to the zip file
 * @param {Object} [options]
 * @param {Function} [options.filter] - called with each entry; return false to skip it
 */
const entries = (zipPath, {filter} = {}) => readEntries(zipPath, filter, true);

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
    const preCheckEntries = zip.getEntries().filter(entry => {
        return !(entry.entryName.match(/^__MACOSX/) || entry.entryName.match(/\.DS_Store$/));
    });

    if (preCheckEntries.length === 1 && preCheckEntries[0].entryName.includes('.zip')) {
        const childZipBuffer = preCheckEntries[0].getData();

        // Redeclare the results array, we don't want to lust parent zip files
        zip = _private.openZipForRead(childZipBuffer);
    }

    // Entries is cleaned first
    let entries = zip.getEntries().filter(entry => {
        return !(entry.entryName.match(/^__MACOSX/) || entry.entryName.match(/\.DS_Store$/));
    });
    // If the first entry is a directory, and every entry starts with the same directory, we have a top level directory
    let firstEntry = entries[0];
    let hasTopLevelDir = firstEntry.isDirectory && entries.every(x => x.entryName.startsWith(firstEntry.entryName));

    // If we have a topLevelDirectory, remove it
    if (hasTopLevelDir) {
        entries.shift();
    }

    entries.forEach(zipEntry => {
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

const deleteFile = async fileToDelete => {
    ensureFileSync(fileToDelete);

    return await remove(fileToDelete);
};

export default {
    read,
    entries,
    write,
    _private,
    deleteFile
};
