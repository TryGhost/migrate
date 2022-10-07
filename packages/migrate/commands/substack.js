const substack = require('../sources/substack');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'substack';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'substack <pathToZip> <url>';

// Description for the top level command
exports.desc = 'Migrate from a Substack ZIP file';

// Descriptions for the individual params
exports.paramsDesc = [
    'Path to a zip file',
    'Provide a URL (without trailing slash) to the hosted source site, so we can scrape data'
];

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
    sywac.array('-s --scrape', {
        choices: ['all', 'img', 'web', 'media', 'files', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    });
    sywac.number('--sizeLimit', {
        defaultValue: false,
        desc: 'Assets larger than this size (defined in MB) will be ignored'
    });
    sywac.string('-e --email', {
        defaultValue: null,
        desc: 'Provide an email for users e.g. john@mycompany.com to create a general user w/ slug `john` and provided email'
    });
    sywac.boolean('--drafts', {
        defaultValue: true,
        desc: 'Import draft posts'
    });
    sywac.boolean('--threads', {
        defaultValue: false,
        desc: 'Import thread posts'
    });
    sywac.boolean('--useMetaImage', {
        defaultValue: true,
        desc: 'Use "og:image" value as the feature image'
    });
    sywac.boolean('--useMetaAuthor', {
        defaultValue: true,
        desc: 'Use the author field from ld+json (useful for posts with multiple authors)'
    });
    sywac.string('--subscribeLink', {
        defaultValue: '#/portal/signup',
        desc: 'Provide a path that existing "subscribe" anchors will link to e.g. "/join-us" or "#/portal/signup" (# characters need to be escaped with a \\)'
    });
    sywac.boolean('--comments', {
        defaultValue: true,
        desc: 'Keep comment buttons'
    });
    sywac.string('--commentLink', {
        defaultValue: '#ghost-comments-root',
        desc: 'Provide a path that existing "comment" anchors will link to e.g. "#comments" or "#ghost-comments-root" (# characters need to be escaped with a \\)'
    });
    sywac.string('--postsBefore', {
        defaultValue: null,
        desc: 'Only migrate posts before and including a given date e.g. \'March 20 2018\''
    });
    sywac.string('--postsAfter', {
        defaultValue: null,
        desc: 'Only migrate posts after and including a given date e.g. \'August 16 2021\''
    });
    sywac.number('--wait_after_scrape', {
        defaultValue: 2000,
        desc: 'Time in ms to wait after a URL is scraped'
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

    // Remove trailing slash from URL
    if (argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = substack.getTaskRunner(argv.pathToZip, argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', require('util').inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    if (argv.verbose) {
        ui.log.info(`Cached files can be found at ${context.fileCache.cacheDir}`);
    }

    // Report success
    if (argv.zip) {
        let outputFile = await context.outputFile;
        ui.log.ok(`Successfully written output to ${outputFile.path} in ${Date.now() - timer}ms.`);
    }
};
