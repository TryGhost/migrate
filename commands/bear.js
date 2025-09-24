import {Command} from 'commander';
import source from '@tryghost/mg-bear-export';
import {getProcessOptions} from '../lib/process-options.js';
import logging from '@tryghost/logging';

const command = new Command('bear')
    .description('Migrate from Bear Blog')
    .requiredOption('--pathToFile <path>', 'Path to Bear Blog CSV export file')
    .option('-V, --verbose', 'Show verbose output', false)
    .option('--zip', 'Create a zip file', true)
    .option('-s, --scrape <mode>', 'Configure scraping tasks', 'all')
    .option('--sizeLimit <size>', 'Max size (in MB) for media files', false)
    .option('--addTags <tags>', 'Additional tags to add to all posts')
    .option('--fallBackHTMLCard', 'Fall back to HTML card if Lexical conversion fails', true)
    .option('--cache', 'Persist local cache after migration', true)
    .action(async (options) => {
        const processOptions = getProcessOptions(options);

        processOptions.options = {
            ...processOptions.options,
            pathToFile: options.pathToFile,
            fallBackHTMLCard: options.fallBackHTMLCard,
            addTags: options.addTags ? options.addTags.split(',').map(tag => tag.trim()) : []
        };

        try {
            await source(processOptions);
        } catch (error) {
            logging.error(`Failed to migrate from Bear Blog: ${error.message}`);
            process.exit(1);
        }
    });

export default command; 