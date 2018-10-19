const readZip = require('./lib/read-zip');
const process = require('./lib/process');

const mediumExport = module.exports = (pathToZip) => {
    let input = readZip(pathToZip);
    let output = process(input);

    return output;
};

if (require.main === module && process.argv[2]) {
   console.log(JSON.stringify(mediumExport(process.argv[2]), null, 2)); // eslint-disable-line
}
