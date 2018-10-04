const baseTemplate = require('./base-template');
const stripMeta = require('./strip-meta');

module.exports = (input) => {
    // Construct a basic Ghost JSON template
    let output = baseTemplate();

    // Strip any meta data from the input
    output.data = stripMeta(input);

    // Process relationships from nested form

    //

    return output;
};
