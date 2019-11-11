const fetch = require('./lib/fetch');
const process = require('./lib/processor');

module.exports.discover = fetch.discover;

module.exports.fetchAll = async (url) => {
    let results = await fetch.all(url);

    return process.all(results);
};
