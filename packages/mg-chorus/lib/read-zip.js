import fsUtils from '@tryghost/mg-fs-utils';
import {_base as debugFactory} from '@tryghost/debug';

const debug = debugFactory('migrate:chorus:lib:read-zip');

const readChorusZip = ({content, entries, options, skippedFileCount}) => {
    fsUtils.zip.read(entries, (entryName, zipEntry) => {
        // Catch all JSON files
        if (/^Entry:.*\.json$/.test(entryName)) {
            content.posts.push({
                name: entryName,
                source: JSON.parse(zipEntry.getData().toString('utf8'))
            });

        // Skip if not matched above, and report skipped files if `--verbose`
        } else {
            if (options.verbose) {
                debug(`Skipped: ${entryName}`);
            }
            skippedFileCount += 1;
        }
    });

    return {
        content,
        skippedFileCount
    };
};

export default (entries, options) => {
    let content = {
        posts: []
    };

    let skippedFileCount = 0;

    // We only support the current Chorus export file structure:
    // - entries.csv
    // - Entry:0969db64-b8d7-11ed-afa1-0242ac120001.json
    // - Entry:0969db64-b8d7-11ed-afa1-0242ac120002.json

    const ifIsArray = Array.isArray(entries);

    if (ifIsArray && entries.length > 1) {
        entries.forEach((file) => {
            const zipContent = readChorusZip({content, entries: file, options, skippedFileCount});
            content = zipContent.content;
            skippedFileCount = zipContent.skippedFileCount;
        });
    } else {
        const zipContent = readChorusZip({content, entries: entries[0], options, skippedFileCount});
        content = zipContent.content;
        skippedFileCount = zipContent.skippedFileCount;
    }

    debug(`Skipped files: ${skippedFileCount}`);

    return content;
};
