import {formatISO, parseISO, isBefore, isAfter, add} from 'date-fns';
import _ from 'lodash';
import errors from '@tryghost/errors';
import {slugify} from '@tryghost/string';
import {_base as debugFactory} from '@tryghost/debug';
import he from 'he';

const debug = debugFactory('migrate:substack:mapper');

const mapConfig = (data, options) => {
    const {url, email, useMetaAuthor, addTag, addPlatformTag, addTypeTag, addAccessTag} = options;
    const slug = data.post_id.replace(/^(?:\d{1,10}\.)(\S*)/gm, '$1');

    // Get an ISO 8601 date - https://date-fns.org/docs/formatISO
    const dateNow = formatISO(new Date());

    const typeSlug = slugify(data.type);
    const visibilitySlug = slugify(data.audience);

    const contentType = (typeSlug === 'page') ? 'page' : 'post';

    const mappedData = {
        url: `${url}/p/${slug}`,
        substackId: data.post_id,
        substackPodcastURL: data.podcast_url || false,
        data: {
            slug: slug,
            published_at: data.post_date || dateNow,
            updated_at: data.post_date || dateNow,
            created_at: data.post_date || dateNow,
            title: data.title || slug,
            custom_excerpt: (data.subtitle) ? he.decode(data.subtitle) : null,
            type: contentType,
            html: data.html || null,
            status: data.is_published.toLowerCase() === `true` ? 'published' : 'draft',
            visibility: data.audience === 'only_paid' ? 'paid' : data.audience === 'only_free' ? 'members' : 'public',
            tags: []
        }
    };

    let typeSlugSlugify = slugify(typeSlug);
    mappedData.data.tags.push({
        url: `${url}/tag/${typeSlugSlugify}`,
        data: {
            slug: typeSlugSlugify,
            name: _.startCase(typeSlug)
        }
    });

    if (addTag) {
        let trimmedTag = addTag.trim();
        let trimmedTagSlug = slugify(trimmedTag);
        mappedData.data.tags.push({
            url: `${url}/tag/${trimmedTagSlug}`,
            data: {
                slug: trimmedTagSlug,
                name: trimmedTag
            }
        });
    }

    if (addPlatformTag) {
        mappedData.data.tags.push({
            url: `migrator-added-tag`,
            data: {
                slug: `hash-substack`,
                name: `#substack`
            }
        });
    }

    // Add an internal tag based on the type of post
    if (addTypeTag) {
        mappedData.data.tags.push({
            url: `migrator-added-tag-substack-type-${typeSlug}`,
            data: {
                slug: `hash-substack-type-${typeSlug}`,
                name: `#substack-type-${typeSlug}`
            }
        });
    }

    // Add tags based on post visibility
    if (addAccessTag) {
        mappedData.data.tags.push({
            url: `migrator-added-tag-substack-access-${visibilitySlug}`,
            data: {
                slug: `hash-substack-access-${visibilitySlug}`,
                name: `#substack-access-${visibilitySlug}`
            }
        });
    }

    if (email && !useMetaAuthor) {
        const authorSlug = email.replace(/(^[\w_-]*)(@[\w_-]*\.\w*(?:\.\w{0,2})?)/, '$1');

        mappedData.data.author = {
            url: `${url}/author/${authorSlug}`,
            data: {
                email: email,
                slug: authorSlug,
                roles: [
                    'Contributor'
                ]
            }
        };
    }

    return mappedData;
};

/**
 * Convert the supplied post content & meta data and filter using the given options
 *
 * @param {Object[]} input - The input who are responsible for the project.
 * @param {Array} input.meta - An array if post meta objects
 * @param {Array} input.posts - An array of post data objects, inc content
 *
 * @returns {Array} A singular array of post objects, in a structure compatible with the other Migrate tools
 */
export default async (input, options) => {
    const output = {
        posts: []
    };

    if (input.posts.length < 1) {
        return new errors.NoContentError({message: 'Input file is empty'});
    }

    // Inline the HTML we have with the CSV data
    input.meta.map((post) => {
        const thisPostHTML = input.posts.find(item => item.name.includes(post.post_id));
        post.html = thisPostHTML?.html ?? '';
        return post;
    });

    // Delete the posts array
    delete input.posts;

    // Reassign the CSV array to input var
    input = input.meta;

    if (!options.posts) {
        debug(`Ignoring posts`);
        input = input.filter(data => data.type.toLowerCase() !== `newsletter`);
    }

    if (!options.drafts) {
        debug(`Ignoring drafts`);
        input = input.filter(data => data.is_published.toLowerCase() === `true`);
    }

    if (!options.pages) {
        debug(`Ignoring pages`);
        input = input.filter(data => data.type.toLowerCase() !== `page`);
    }

    if (!options.threads) {
        debug(`Ignoring threads`);
        input = input.filter(data => data.type.toLowerCase() !== `thread`);
    }

    if (!options.podcasts) {
        debug(`Ignoring podcasts`);
        input = input.filter(data => data.type.toLowerCase() !== `podcast`);
    }

    if (options.postsBefore && options.postsAfter) {
        const startDate = parseISO(formatISO(new Date(options.postsAfter)));
        const endDate = add(parseISO(formatISO(new Date(options.postsBefore))), {
            days: 1
        });
        debug(`Getting posts between ${startDate} and ${endDate}`);

        await input.forEach((data) => {
            if (isAfter(parseISO(data.post_date), startDate) && isBefore(parseISO(data.post_date), endDate)) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else if (options.postsAfter) {
        const startDate = parseISO(formatISO(new Date(options.postsAfter)));
        debug(`Getting posts after ${startDate}`);

        await input.forEach((data) => {
            if (isAfter(parseISO(data.post_date), startDate)) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else if (options.postsBefore) {
        const endDate = add(parseISO(formatISO(new Date(options.postsBefore))), {
            days: 1
        });
        debug(`Getting posts until ${endDate}`);

        await input.forEach((data) => {
            if (isBefore(parseISO(data.post_date), endDate)) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else {
        debug(`Getting all posts`);
        await input.forEach((data) => {
            output.posts.push(mapConfig(data, options));
        });
    }

    return output;
};
