const parse = require('@tryghost/mg-fs-utils/lib/parse-csv');
const path = require('path');
const fs = require('fs-extra');
const {formatCSV} = require('./format-csv');

const normalizeCSVFileToJSON = async (options) => {
    const columnsToMap = options.columnsToMap || [];
    let results = [];

    try {
        results = await parse(options.path, {
            mapHeaders: ({header}) => {
                let mapping = columnsToMap.find(column => (column.from === header));
                if (mapping) {
                    return mapping.to;
                }

                return header;
            }
        });
    } catch (error) {
        console.error(error);
    }

    return results;
};

const normalizeMembersCSV = async (options) => {
    const results = await normalizeCSVFileToJSON(options);
    const outputPath = path.join(options.path || `ghost-members-import-${Date.now()}.csv`);

    let fields = ['email', 'name', 'note', 'subscribed_to_emails', 'complimentary_plan', 'stripe_customer_id', 'created_at', 'deleted_at', 'labels'];

    if (results && results.length) {
        fields = Object.keys(results[0]);
        console.log('normalizeMembersCSV -> fields', fields);
    }

    const normalizedCSV = formatCSV(results, fields);

    return fs.writeFile(outputPath, normalizedCSV);
};

const convertCSV = async (originFilePath) => {
    await normalizeMembersCSV({
        path: originFilePath,
        columnsToMap: [{
            from: 'email_disabled',
            to: 'subscribed_to_emails',
            negate: true
        }, {
            from: 'stripe_connected_customer_id',
            to: 'stripe_customer_id'
        }]
    });
};

module.exports = {
    normalizeCSVFileToJSON: normalizeCSVFileToJSON,
    normalizeMembersCSV: normalizeMembersCSV,
    convertCSV: convertCSV
};
