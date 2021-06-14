const fs = require('fs');
const path = require('path');

module.exports.readSync = (name) => {
    let fixtureFileName = path.join(__dirname, '../', 'fixtures', name);
    let content = fs.readFileSync(fixtureFileName, {encoding: 'utf8'});

    if (path.extname(name) === '.json') {
        return JSON.parse(content);
    }

    return content;
};
