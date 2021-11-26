const fs = require('fs');
const path = require('path');

module.exports.readSync = (name) => {
    let fixtureFileName = path.join(__dirname, '../', 'fixtures', name);
    return fs.readFileSync(fixtureFileName, {encoding: 'utf8'});
};
