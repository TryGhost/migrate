const readZip = require('./lib/read-zip');
const process = require('./lib/process');

const jekyllExport = module.exports = (pathToZip, options) => {
    let input = readZip(pathToZip, options);
    let output = process(input, options);

    return output;
};

if (require.main === module && process.argv[2]) {
   console.log(JSON.stringify(jekyllExport(process.argv[2]), null, 2)); // eslint-disable-line
}
