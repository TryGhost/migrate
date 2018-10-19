const $ = require('cheerio');

module.exports = (content) => {
    return $(content).html().trim();
};
