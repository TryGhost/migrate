const readZip = require('./lib/read-zip');
const process = require('./lib/process');

const curatedExport = module.exports = (pathToZip, ctx) => {
    let input = readZip(pathToZip, ctx);
    let output = process(input, ctx);

    return output;
};

if (require.main === module && process.argv[2]) {
   console.log(JSON.stringify(curatedExport(process.argv[2]), null, 2)); // eslint-disable-line
}
