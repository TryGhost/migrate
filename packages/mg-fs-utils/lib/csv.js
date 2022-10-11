import {parse} from 'csv-parse';
import {parse as parseSync} from 'csv-parse/sync';
import fs from 'fs-extra';
import {isDate} from 'date-fns';

/**
 * Parse a CSV file and make available as JSON
 * @param {String} filePath - name of file to write
 * @param {Object} options - optional options to pass to `csv-parse`
 */
const parseCSV = (filePath, options = {skip_lines_with_error: true, columns: true, skip_empty_lines: true}) => {
    const parser = parse(options);
    const data = [];
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath);
        fileStream
            .pipe(parser)
            .on('data', async (row) => {
                data.push(row);
            }).on('end', () => {
                return resolve(data);
            }).on('error', (error) => {
                return reject(error);
            });
    });
};

/**
 * Parse a CSV string and make available as JSON
 * @param {String} csvString - CSV as a string
 * @param {Object} options - optional options to pass to `csv-parse`
 */
const parseString = (csvString, options = {skip_lines_with_error: true, columns: true, skip_empty_lines: true}) => {
    const data = parseSync(csvString, options);

    return data;
};

/**
 * Convert a JSON file into a CSV format
 * @param {Array} data - the data to format
 * @param {Array} fields - the fields to pick and use as column header
 */
const jsonToCSV = (data, fields = Object.keys(data[0])) => {
    let csv = `${fields.join(',')}\r\n`;
    let entry;
    let field;
    let j;
    let i;

    for (j = 0; j < data.length; j = j + 1) {
        entry = data[j];

        for (i = 0; i < fields.length; i = i + 1) {
            field = fields[i];

            let fieldToAdd;

            if (entry[field] !== null) {
                if (isDate(entry[field])) {
                    fieldToAdd = entry[field].toISOString();
                } else if (entry[field] && entry[field].toString().indexOf(',') !== -1) { // If the field contains a comma, wrap it in quotes
                    fieldToAdd = `"${entry[field]}"`;
                } else {
                    fieldToAdd = entry[field];
                }
            } else {
                fieldToAdd = '';
            }

            csv += fieldToAdd !== undefined ? fieldToAdd : '';
            if (i !== fields.length - 1) {
                csv += ',';
            }
        }
        csv += '\r\n';
    }

    return csv;
};

export default {
    parseCSV,
    parseString,
    jsonToCSV
};
