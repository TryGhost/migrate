const errors = require('@tryghost/errors');

module.exports.ConvertError = ({src, message = `Unable to convert post to Mobiledoc`, reference, originalError}) => {
    let error = new errors.InternalServerError({message: `${message} - ${src}`});

    error.errorType = 'ConvertError';
    error.code = originalError.message;
    error.src = src;
    if (reference) {
        error.reference = reference;
    }
    error.originalError = originalError;

    return error;
};
