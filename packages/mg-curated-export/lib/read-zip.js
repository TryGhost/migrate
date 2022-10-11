import fsUtils from '@tryghost/mg-fs-utils';
import {ui} from '@tryghost/pretty-cli';

export default (zipPath, options) => {
    let content = {
        posts: []
    };

    let skippedFileCount = 0;

    fsUtils.zip.read(zipPath, (entryName, zipEntry) => {
        const jsonFileRegex = new RegExp('^data-export/issues/published/[0-9]{1,10}/[0-9]{1,10}.json');
        const imageFileRegex = new RegExp('^data-export/issues/published/[0-9]{1,10}/.*(.jpg|.png|.jpeg|.gif|.svg|.svgz)');

        // Catch all JSON files inside `data-export/issues/published/[issue]/`
        if (jsonFileRegex.test(entryName)) {
            content.posts.push({
                name: entryName,
                json: JSON.parse(zipEntry.getData().toString('utf8'))
            });

        // Catch all issue image files in `data-export/issues/published/[issue]/`
        } else if (imageFileRegex.test(entryName)) {
            // Skip already-processed images
            if (entryName.includes('square_thumb') || entryName.includes('original_ratio_extra_large') || entryName.includes('original_ratio_medium')) {
                return;
            }

            // Get image options and allow optimizing
            let imageOptions = options.fileCache.resolveImageFileName(entryName);
            imageOptions.optimize = true;

            // Remove the base path from images for cleanliness
            const issueBasePath = 'data-export/issues/published/';
            imageOptions.outputPath = imageOptions.outputPath.replace(issueBasePath, '');
            imageOptions.storagePath = imageOptions.storagePath.replace(issueBasePath, '');

            // Write the file
            options.fileCache.writeImageFile(zipEntry.getData(), imageOptions);

        // Skip if not matched above, and report skipped files if `--verbose`
        } else {
            if (options.verbose) {
                ui.log.info('Skipped: ' + entryName);
            }
            skippedFileCount += 1;
        }
    });

    ui.log.info('Skipped files: ' + skippedFileCount);

    return content;
};
