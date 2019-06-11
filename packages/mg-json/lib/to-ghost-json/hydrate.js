const _ = require('lodash');
/**
 * Hydrate Ghost objects
 * Extend object with the minimum data needed for an import to succeed
 * We can't always get a full set of data when importing from a non-Ghost source
 * This file copes with faking data to make an import succeed
 */

/**
 * User(s)
 *
 * To import a user we need at least:
 * - a name
 * - an email address
 */

const fakeName = 'Dummy User';
const fakeEmailDomain = `dummyemail.com`;
const fakeEmail = (nameSlug, domain) => `${nameSlug}@${domain}`;

const hydrateUser = (input, options) => {
    // Handle the case where we have a slug but no name
    if (!input.name && input.slug) {
        input.name = _.startCase(input.slug);
    } else if (!input.name) {
        // Else if there's no name or slug, we'll have to use a fake
        input.name = fakeName;
    }

    // Handle the case where there is no email by generating one based on slug or name
    if (!input.email) {
        input.email = fakeEmail(input.slug || _.kebabCase(input.name), options.email || fakeEmailDomain);
    }

    return input;
};

// Alias plural form only, as this should already have been normalised
module.exports.users = hydrateUser;

/**
 * Post(s)
 *
 * To import a post we need at least:
 * - a title
 * - a valid status or no status
 */

const fakeTitle = '(Untitled)';

const hydratePost = (input, options) => {
    if (!input.title) {
        input.title = options.title || fakeTitle;
    }

    if (!_.includes(['published', 'draft', 'scheduled'], input.status)) {
        delete input.status;
    }

    return input;
};

module.exports.posts = hydratePost;
