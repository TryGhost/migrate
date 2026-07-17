import errors from '@tryghost/errors';
import {slugify} from '@tryghost/string';
import {_base as debugFactory} from '@tryghost/debug';
import he from 'he';

const debug = debugFactory('migrate:substack:mapper');

const mapConfig = (data, options) => {
    const {url, email, useMetaAuthor} = options;
    const slug = data.post_id.replace(/^(?:\d{1,10}\.)(\S*)/gm, '$1');

    const dateNow = new Date();

    const typeSlug = slugify(data.type);

    const contentType = typeSlug === 'page' ? 'page' : 'post';

    const mappedData = {
        url: `${url}/p/${slug}`,
        substackId: data.post_id,
        substackPodcastURL: data.podcast_url || false,
        substackData: data,
        data: {
            slug: slug,
            comment_id: data.post_id.replace(/\..*$/, ''),
            published_at: data.post_date || dateNow,
            updated_at: data.post_date || dateNow,
            created_at: data.post_date || dateNow,
            title: data.title || slug,
            custom_excerpt: data.subtitle ? he.decode(data.subtitle) : null,
            type: contentType,
            html: data.html || null,
            status: data.is_published.toLowerCase() === `true` ? 'published' : 'draft',
            visibility: data.audience === 'only_paid' ? 'paid' : data.audience === 'only_free' ? 'members' : 'public',
            tags: []
        }
    };

    if (email && !useMetaAuthor) {
        const authorSlug = email.replace(/(^[\w_-]*)(@[\w_-]*\.\w*(?:\.\w{0,2})?)/, '$1');

        mappedData.data.author = {
            url: `${url}/author/${authorSlug}`,
            data: {
                email: email,
                slug: authorSlug,
                roles: ['Contributor']
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

    // Drive from HTML files we have, pulling in CSV metadata for each
    const csvMeta = input.meta;
    const htmlPosts = input.posts;
    input = htmlPosts
        .map(htmlPost => {
            const postId = htmlPost.name.replace(/\.html$/, '');
            const meta = csvMeta.find(item => item.post_id === postId);
            if (meta) {
                meta.html = htmlPost.html;
            }
            return meta;
        })
        .filter(Boolean);

    // The migration is driven from the HTML files in the export, so any post listed
    // in the CSV without a matching HTML file is skipped - often the most recent
    // posts, whose HTML can be missing from a Substack export. Warn (without stopping
    // the migration) so these dropped posts aren't a silent surprise.
    const skippedPostCount = csvMeta.length - input.length;
    if (skippedPostCount > 0) {
        // eslint-disable-next-line no-console
        console.warn(
            `Warning: ${skippedPostCount} of ${csvMeta.length} posts in the CSV have no matching HTML file in the export and will be skipped (${htmlPosts.length} HTML files found).`
        );
    }

    // Preserve consistent ordering (chronological, with numeric ID as tiebreaker)
    input.sort((a, b) => {
        const dateDiff = new Date(a.post_date) - new Date(b.post_date);
        if (dateDiff !== 0) {
            return dateDiff;
        }
        return parseInt(a.post_id) - parseInt(b.post_id);
    });

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
        const startDate = new Date(options.postsAfter);
        const endDate = new Date(new Date(options.postsBefore).setDate(new Date(options.postsBefore).getDate() + 1));
        debug(`Getting posts between ${startDate} and ${endDate}`);

        await input.forEach(data => {
            if (new Date(data.post_date) > startDate && new Date(data.post_date) < endDate) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else if (options.postsAfter) {
        const startDate = new Date(options.postsAfter);
        debug(`Getting posts after ${startDate}`);

        await input.forEach(data => {
            if (new Date(data.post_date) > startDate) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else if (options.postsBefore) {
        const endDate = new Date(new Date(options.postsBefore).setDate(new Date(options.postsBefore).getDate() + 1));
        debug(`Getting posts until ${endDate}`);

        await input.forEach(data => {
            if (new Date(data.post_date) < endDate) {
                output.posts.push(mapConfig(data, options));
            }
        });
    } else {
        debug(`Getting all posts`);
        await input.forEach(data => {
            output.posts.push(mapConfig(data, options));
        });
    }

    return output;
};
