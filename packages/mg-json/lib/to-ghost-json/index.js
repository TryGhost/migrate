const baseTemplate = require('./base-template');
const stripMeta = require('./meta-to-ghost');
const processPostRelations = require('./process-post-relations');
const reorderTags = require('./reorder-tags');

module.exports = (input, options = {}) => {
    // Construct a basic Ghost JSON template
    let output = baseTemplate();

    // Reorder tags so #internal-tags appear last
    input = reorderTags(input);

    // Process relationships from nested form
    output.data = processPostRelations(input);

    // Strip any meta data from the input / flatten structures
    output.data = stripMeta(output.data, options);

    return output;
};
