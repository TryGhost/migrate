const fetch = require('./lib/fetch');
const process = require('./lib/processor');

module.exports.discover = fetch.discover;

module.exports.fetch = fetch;

module.exports.process = process;
