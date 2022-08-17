const {formatISO, parseISO, isBefore, isAfter, add} = require('date-fns');
const _ = require('lodash');
const errors = require('@tryghost/errors');
const {slugify} = require('@tryghost/string');

const mapConfig = (data, {url, readPosts, email, useMetaAuthor}) => {
    const slug = data.post_id.replace(/^(?:\d{1,10}\.)(\S*)/gm, '$1');

    // Get an ISO 8601 date - https://date-fns.org/docs/formatISO
    const dateNow = formatISO(new Date());

    const typeSlug = slugify(data.type);
    const visibilitySlug = slugify(data.audience);

    const mappedData = {
        url: `${url}/p/${slug}`,
        substackId: data.post_id,
        data: {
            slug: slug,
            published_at: data.post_date || dateNow,
            updated_at: data.post_date || dateNow,
            created_at: data.post_date || dateNow,
            title: data.title || slug,
            custom_excerpt: data.subtitle,
            type: 'post',
            html: !readPosts && data.body_html ? data.body_html : null,
            status: data.is_published.toLowerCase() === `true` ? 'published' : 'draft',
            visibility: data.audience === 'only_paid' ? 'paid' : data.audience === 'only_free' ? 'members' : 'public',
            tags: [
                {
                    url: 'migrator-added-tag',
                    data: {
                        name: '#substack'
                    }
                },
                {
                    url: `${url}/tag/${typeSlug}`,
                    data: {
                        name: _.startCase(typeSlug)
                    }
                }
            ]
        }
    };

    // Add an internal tag based on the type of post
    mappedData.data.tags.push({
        url: `migrator-added-tag-substack-type-${typeSlug}`,
        data: {
            slug: `hash-substack-type-${typeSlug}`,
            name: `#substack-type-${typeSlug}`
        }
    });

    // Add tags based on post visibility
    mappedData.data.tags.push({
        url: `migrator-added-tag-substack-access-${visibilitySlug}`,
        data: {
            slug: `hash-substack-access-${visibilitySlug}`,
            name: `#substack-access-${visibilitySlug}`
        }
    });

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

module.exports = async (input, options) => {
    const output = {
        posts: []
    };

    if (input.length < 1) {
        return new errors.NoContentError({message: 'Input file is empty'});
    }

    if (!options.drafts) {
        input = input.filter(data => data.is_published.toLowerCase() === `true`);
    }

    if (options.postsBefore && options.postsAfter) {
        const startDate = parseISO(formatISO(new Date(options.postsAfter)));
        const endDate = add(parseISO(formatISO(new Date(options.postsBefore))), {
            days: 1
        });

        await input.forEach((data) => {
            if (isAfter(parseISO(data.post_date), startDate) && isBefore(parseISO(data.post_date), endDate)) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else if (options.postsAfter) {
        const startDate = parseISO(formatISO(new Date(options.postsAfter)));

        await input.forEach((data) => {
            if (isAfter(parseISO(data.post_date), startDate)) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else if (options.postsBefore) {
        const endDate = add(parseISO(formatISO(new Date(options.postsBefore))), {
            days: 1
        });

        await input.forEach((data) => {
            if (isBefore(parseISO(data.post_date), endDate)) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else {
        await input.forEach((data) => {
            output.posts.push(mapConfig(data, options));
        });
    }

    return output;
};
