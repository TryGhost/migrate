const jekyll = require('../sources/jekyll');
const ui = require('@tryghost/pretty-cli').ui;
const Table = require('tty-table');

// Internal ID in case we need one.
exports.id = 'jekyll';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'jekyll <pathToZip>';

// Description for the top level command
exports.desc = 'Migrate from Jekyll using an export zip';

// Descriptions for the individual params
exports.paramsDesc = ['Path to a jekyll export zip'];

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('--zip', {
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
    sywac.string('-u --url', {
        defaultValue: false,
        desc: 'Provide a URL (without trailing slash) to the hosted source site'
    });
    sywac.string('-e --email', {
        defaultValue: false,
        desc: 'Provide an email domain for users e.g. mycompany.com'
    });
    sywac.string('--addTags', {
        defaultValue: null,
        desc: 'Provide one or more tag names which should be added to every post in this migration'
    });
    sywac.enumeration('--datedPermalinks', {
        choices: ['none', '/yyyy/mm/', '/yyyy/mm/dd/'],
        defaultValue: 'none',
        desc: 'Set the dated permalink structure (e.g. /yyyy/mm/dd/)'
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
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = jekyll.getTaskRunner(argv.pathToZip, argv);

        // Run the migration
        await migrate.run(context);

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
