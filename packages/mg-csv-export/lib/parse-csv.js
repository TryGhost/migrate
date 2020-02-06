const parse = require('csv-parse');
const fs = require('fs');

module.exports = (filePath) => {
    const parser = parse({ skip_lines_with_error: true, columns: true, skip_empty_lines: true});
    const data = [];
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath);
        fileStream
            .pipe(parser)
            .on('data', async (row) => {
                data.push(row);

            }).on('end', () => {
                console.log('Total rows collected:', data.length);

                return resolve(data);
            }).on('error', (error) => {
                return reject(error);
            });
    });
};
