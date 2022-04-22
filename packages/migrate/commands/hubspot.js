const hubspot = require('../sources/hubspot');
const ui = require('@tryghost/pretty-cli').ui;
const Table = require('tty-table');

// Internal ID in case we need one.
exports.id = 'hubspot';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'hubspot [url] <hapikey>';

// Description for the top level command
exports.desc = 'Migrate from Hubspot using the API';

// Descriptions for the individual params
exports.paramsDesc = ['URL of the blog you want to migrate', 'Hubspot API Key (hapikey)'];

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('-z, --zip', {
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    });
    sywac.enumeration('-s --scrape', {
        choices: ['all', 'img', 'web', 'media', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    });
    sywac.number('--size_limit', {
        defaultValue: false,
        desc: 'Media files larger than this size (defined in MB) will be flagged as oversize'
    });
    sywac.string('-e --email', {
        defaultValue: false,
        desc: 'Provide an email domain for users e.g. mycompany.com'
    });
    sywac.boolean('-I, --info', {
        defaultValue: false,
        desc: 'Show hubspot blog info only'
    });
    sywac.number('-b, --batch', {
        defaultValue: 0,
        desc: 'Batch number to run (defaults to running all)'
    });
    sywac.number('-l, --limit', {
        defaultValue: 100,
        desc: 'Number of items fetched in a batch i.e. batch size'
    });
    sywac.boolean('--fallBackHTMLCard', {
        defaultValue: false,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    });
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    if (argv.verbose) {
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from hubspot site`);
    }

    if (argv.batch !== 0) {
        ui.log.info(`Running batch ${argv.batch} (groups of ${argv.limit} posts)`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = hubspot.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.info && context.info) {
            let batches = context.info.batches.posts;
            ui.log.info(`Batch info: ${context.info.totals.posts} posts ${batches} batches.`);
        }

        if (context.sizeReports && argv.size_limit) {
            let tableColOpts = {
                headerAlign: 'left',
                headerColor: 'cyan',
                align: 'left',
                color: 'gray',
                formatter: function (cellValue) {
                    return this.style(cellValue, 'red', 'bold');
                }
            };

            Object.entries(context.sizeReports).forEach(([reportTypeKey, reportTypeValue]) => {
                let tableHeader = [
                    Object.assign({}, tableColOpts, {
                        alias: 'Bytes',
                        value: 'bytesSize'
                    }),
                    Object.assign({}, tableColOpts, {
                        alias: 'Source',
                        value: 'src'
                    })
                ];

                let tableRows = [];

                reportTypeValue.data.forEach((element) => {
                    tableRows.push(element);
                });

                if (tableRows.length) {
                    const out = Table(tableHeader, tableRows, {compact: true}).render();
                    ui.log.warn(`${tableRows.length} '${reportTypeKey}' ${(tableRows.length === 1) ? 'file' : 'files'} is too large - Full report at ${reportTypeValue.path}`, out);
                } else {
                    ui.log.ok(`All files are ${reportTypeKey} are OK - Full report at ${reportTypeValue.path}`);
                }
            });
        }

        if (argv.verbose) {
            ui.log.info('Done', require('util').inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    // Report success
    if (argv.zip) {
        let outputFile = await context.outputFile;
        ui.log.ok(`Successfully written output to ${outputFile.path} in ${Date.now() - timer}ms.`);
    }
};
