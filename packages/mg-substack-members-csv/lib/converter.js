const Promise = require('bluebird');
const csvParser = require('csv-parser');
const _ = require('lodash');
const fs = require('fs-extra');
const {formatCSV} = require('./format-csv');

const normalizeCSVFileToJSON = async (options) => {
    const columnsToExtract = options.columnsToExtract || [];
    const columnsToMap = options.columnsToMap || [];
    let results = [];
    const rows = [];

    return new Promise(function (resolve, reject) {
        let readFile = fs.createReadStream(options.path);

        readFile.on('err', function (err) {
            reject(err);
        })
            .pipe(csvParser({
                mapHeaders: ({header}) => {
                    let mapping = columnsToMap.find(column => (column.from === header));
                    if (mapping) {
                        return mapping.to;
                    }

                    return header;
                }
            }))
            .on('data', function (row) {
                rows.push(row);
            })
            .on('end', function () {
                // If CSV is single column - return all values including header
                var headers = _.keys(rows[0]), result = {}, columnMap = {};

                if (columnsToExtract.length === 1 && headers.length === 1) {
                    results = _.map(rows, function (value) {
                        result = {};
                        result[columnsToExtract[0].name] = value[headers[0]];
                        return result;
                    });
                } else {
                    // If there are multiple columns in csv file
                    // try to match headers using lookup value

                    _.map(columnsToExtract, function findMatches(column) {
                        _.each(headers, function checkheader(header) {
                            if (column.lookup.test(header)) {
                                columnMap[column.name] = header;
                            }
                        });
                    });

                    results = _.map(rows, function evaluateRow(row) {
                        result = {};
                        _.each(columnMap, function returnMatches(value, key) {
                            const mapping = columnsToMap.find(column => (column.to === key));

                            if (mapping && mapping.negate) {
                                result[key] = !(String(row[value]).toLowerCase() === 'true');
                            } else {
                                result[key] = row[value];
                            }
                        });
                        return result;
                    });
                }

                resolve(results);
            });
    });
};

const normalizeMembersCSV = async (options) => {
    const results = await normalizeCSVFileToJSON(options);

    let fields = ['email', 'name', 'note', 'subscribed_to_emails', 'stripe_customer_id'];

    if (results && results.length) {
        fields = Object.keys(results[0]);
    }

    const normalizedCSV = formatCSV(results, fields);

    const resultFilePath = options.destination || options.origin;

    return fs.writeFile(resultFilePath, normalizedCSV);
};

const convertCSV = async (originFilePath, destinationFilePath) => {
    await normalizeMembersCSV({
        path: originFilePath,
        destination: destinationFilePath,
        columnsToMap: [{
            from: 'email_disabled',
            to: 'subscribed_to_emails',
            negate: true
        }, {
            from: 'stripe_connected_customer_id',
            to: 'stripe_customer_id'
        }],
        columnsToExtract: [{
            name: 'email',
            lookup: /^email/i
        }, {
            name: 'name',
            lookup: /name/i
        }, {
            name: 'note',
            lookup: /note/i
        }, {
            name: 'subscribed_to_emails',
            lookup: /subscribed_to_emails/i
        }, {
            name: 'stripe_customer_id',
            lookup: /stripe_customer_id/i
        }, {
            name: 'complimentary_plan',
            lookup: /complimentary_plan/i
        }]
    });
};

module.exports = {
    normalizeCSVFileToJSON: normalizeCSVFileToJSON,
    normalizeMembersCSV: normalizeMembersCSV,
    convertCSV: convertCSV
};
