const parse = require('csv-parse');
const fs = require('fs-extra');

module.exports = (filePath, options = {skip_lines_with_error: true, columns: true, skip_empty_lines: true}) => {
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
