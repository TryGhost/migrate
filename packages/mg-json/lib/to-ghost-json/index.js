const baseTemplate = require('./base-template');
const stripMeta = require('./strip-meta');
const processPostRelations = require('./process-post-relations');

module.exports = (input) => {
    // Construct a basic Ghost JSON template
    let output = baseTemplate();

    // Strip any meta data from the input
    let data = stripMeta(input);

    // Process relationships from nested form
    output.data = processPostRelations(data);

    return output;
};
