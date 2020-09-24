const parse = require('csv-parse');
const fs = require('fs-extra');
const {isDate} = require('date-fns');

/**
 * Parse a CSV file and make available as JSON
 * @param {String} filePath - name of file to write
 * @param {Object} options - optional options to pass to `csv-parse`
 */
module.exports.parse = (filePath, options = {skip_lines_with_error: true, columns: true, skip_empty_lines: true}) => {
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
 * Convert a JSON file into a CSV format
 * @param {Array} data - the data to format
 * @param {Array} fields - the fields to pick and use as column header
 */
module.exports.jsonToCSV = (data, fields = Object.keys(data[0])) => {
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

