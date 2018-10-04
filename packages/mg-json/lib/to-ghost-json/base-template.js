const _ = require('lodash');
const baseJSON = `{
    "meta": {
        "exported_on": <%= timestamp %>,
        "version":"<%= version %>"
    },
    "data": {}
}`;
const baseTemplate = _.template(baseJSON);
const defaultVersion = '2.0.0';

module.exports = (version) => {
    return JSON.parse(baseTemplate({
        timestamp: Date.now(),
        version: version || defaultVersion
    }));
};
