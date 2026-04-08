import {ui} from '@tryghost/pretty-cli';
import fsUtils from '@tryghost/mg-fs-utils';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'clear-cache';

const group = 'Commands:';

// The command to run and any params
const flags = 'clear-cache';

// Description for the top level command
const desc = 'Clear local migration cache';

// Configure all the options
const options = [
    {
        type: 'boolean',
        flags: '--scrape',
        defaultValue: false,
        desc: 'Clear the web scraping & API response cache'
    },
    {
        type: 'boolean',
        flags: '--assets',
        defaultValue: false,
        desc: 'Clear all downloaded assets and the asset cache database'
    },
    {
        type: 'boolean',
        flags: '--images',
        defaultValue: false,
        desc: 'Clear downloaded images only'
    },
    {
        type: 'boolean',
        flags: '--media',
        defaultValue: false,
        desc: 'Clear downloaded media only (video, audio)'
    },
    {
        type: 'boolean',
        flags: '--files',
        defaultValue: false,
        desc: 'Clear downloaded files only (PDFs, etc.)'
    },
    {
        type: 'boolean',
        flags: '-V --verbose',
        defaultValue: Boolean(process?.env?.DEBUG),
        desc: 'Show verbose output'
    }
];

// Build an object of defaults to be exported - Not used here, but needs to be provided
const defaults = convertOptionsToDefaults(options);

// Convert `options` into a list of Sywac types
const setup = sywac => convertOptionsToSywac(options, sywac);

// What to do when this command is executed
const run = async (argv) => {
    try {
        let fsCache = new fsUtils.FileCache('test.dev', {});
        let cacheDir = fsCache.cacheBaseDir;

        const selective = argv.scrape || argv.assets || argv.images || argv.media || argv.files;
        let clear;

        if (selective) {
            const types = [];
            if (argv.scrape) {
                types.push('scrape');
            }
            if (argv.assets) {
                types.push('assets');
            }
            if (argv.images) {
                types.push('images');
            }
            if (argv.media) {
                types.push('media');
            }
            if (argv.files) {
                types.push('files');
            }

            ui.log.info(`Clearing cache (${types.join(', ')}) in: ${cacheDir}/`);
            clear = await fsCache.emptyCacheDirSelective({
                scrape: argv.scrape,
                assets: argv.assets,
                images: argv.images,
                media: argv.media,
                files: argv.files
            });
        } else {
            ui.log.info(`Emptying the directory located at: ${cacheDir}/`);
            clear = await fsCache.emptyCacheDir();
        }

        if (argv.verbose) {
            clear.files.forEach((item) => {
                ui.log.info(`Deleted: ${item}`);
            });
        }

        ui.log.ok(`Deleted ${clear.files.length} files`);
    } catch (error) {
        ui.log.info('Done with errors', error);
    }
};

export default {
    id,
    group,
    flags,
    desc,
    setup,
    run,
    defaults
};
