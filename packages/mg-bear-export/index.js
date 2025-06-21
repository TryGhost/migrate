import {promises as fs} from 'node:fs';
import process from './lib/process.js';

/**
 * Process a Bear blog export CSV file
 * @param {Object} params - Migration parameters
 * @param {Object} params.options - Migration options
 * @returns {Promise<Object>} - Ghost JSON format data
 */
export default async ({options}) => {
    const input = await fs.readFile(options.pathToFile, 'utf-8');
    const processed = await process.all(input, {options});

    return processed;
}; 