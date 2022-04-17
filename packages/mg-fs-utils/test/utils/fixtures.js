const path = require('path');

module.exports.getPath = () => {
    let fixtureFileName = path.join(__dirname, '../', 'fixtures');

    return fixtureFileName;
};
