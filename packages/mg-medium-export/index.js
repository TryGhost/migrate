const readZip = require('./lib/read-zip');
const processHTML = require('./lib/process-html');

const mediumExport = module.exports = (pathToZip) => {
    let input = readZip(pathToZip);
    let output = processHTML(input);

    return output;
};

if (require.main === module && process.argv[2]) {
   console.log(JSON.stringify(mediumExport(process.argv[2]), null, 2)); // eslint-disable-line
}
