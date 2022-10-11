import _ from 'lodash';
import {slugify} from '@tryghost/string';
import Entities from 'html-entities';
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

const fakeName = 'Example User';
const fakeEmailDomain = `example.com`;
const fakeEmail = (nameSlug, domain) => `${nameSlug}@${domain}`;

const hydrateUser = (input, options) => {
    // Handle the case where we have a slug but no name
    if (!input.name && input.slug) {
        input.name = _.startCase(input.slug);
    } else if (!input.name) {
        // Else if there's no name or slug, we'll have to use a fake
        input.name = fakeName;
    }

    // Generate a slug so we can use it for emails
    if (!input.slug) {
        input.slug = slugify(input.name);
    }

    // Handle the case where there is no email by generating one based on slug or name
    if (!input.email) {
        input.email = fakeEmail(input.slug || _.kebabCase(input.name), options.email || fakeEmailDomain);
    }

    // @TODO: log some sort of warning for things like this?
    if (input.bio && input.bio.length > 200) {
        // Naive truncate values that are too long
        input.bio = input.bio.substring(0, 200);
    }

    if (!input.roles) {
        input.roles = ['Contributor'];
    }

    return input;
};

const users = hydrateUser;

/**
 * Tags(s)
 *
 * To import a tag we need at least:
 * - a name
 */

const hydrateTag = (input) => {
    if (!input.slug) {
        input.slug = slugify(input.name);
    }

    // Ensure all internal tags get the correct slug
    if (input.name.startsWith('#') && !input.slug.startsWith('hash-')) {
        input.slug = `hash-${input.slug}`;
    }

    return input;
};

const tags = hydrateTag;

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

    // Cleanup titles
    input.title = Entities.decode(input.title);

    // @TODO: log some sort of warning for things like this?
    if (!_.includes(['published', 'draft', 'scheduled'], input.status)) {
        input.status = 'draft';
    }

    return input;
};

const posts = hydratePost;

export default {
    users,
    tags,
    posts
};
