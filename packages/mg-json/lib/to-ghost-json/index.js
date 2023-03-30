import baseTemplate from './base-template.js';
import stripMeta from './meta-to-ghost.js';
import processPostRelations from './process-post-relations.js';
import validate from './validate.js';
import reorderTags from './reorder-tags.js';

export default (input, options = {}, ctx) => {
    // Construct a basic Ghost JSON template
    let output = baseTemplate();

    // Validate data and potentially alter if needed
    input = validate(input, ctx);

    // Reorder tags so #internal-tags appear last
    input = reorderTags(input);

    // Process relationships from nested form
    output.data = processPostRelations(input);

    // Strip any meta data from the input / flatten structures
    output.data = stripMeta(output.data, options);

    return output;
};
