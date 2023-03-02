import {slugify} from '@tryghost/string';
import {_base as debugFactory} from '@tryghost/debug';
import jsonToHtml from './json-to-html.js';

const debug = debugFactory('migrate:chorus:processor');

const processContent = (groups) => {
    if (!groups) {
        debug(`Post has no content`);
        return '';
    }

    return jsonToHtml(groups);
};

const processPost = (data, options) => {
    const {addPrimaryTag} = options;

    const postUrl = data.source.url;
    const postSlug = data.source.url.match(/([a-zA-Z0-9-_]+)$/)[1];

    const post = {
        url: postUrl,
        data: {
            slug: postSlug,
            title: data?.source?.title || '(Untitled)',
            custom_excerpt: data?.source?.dek?.html || null,
            status: 'published',
            created_at: data.source.createdAt,
            updated_at: data.source.updatedAt,
            published_at: data.source.createdAt,
            tags: [],
            authors: []
        }
    };

    if (data?.source?.authorProfile?.name) {
        let authorSlug = slugify(data.source.authorProfile.name);
        let authorObject = {
            url: `/author/${authorSlug}`,
            data: {
                email: `${authorSlug}@example.com`,
                slug: authorSlug,
                name: data.source.authorProfile.name
            }
        };
        post.data.authors.push(authorObject);
        debug(`Adding author to ${data.slug} post object`, authorObject);
    }

    if (data?.source?.contributors) {
        data?.source?.contributors.forEach((contributor) => {
            let authorSlug = slugify(contributor.fullOrUserName);
            let authorObject = {
                url: `/author/${authorSlug}`,
                data: {
                    email: `${authorSlug}@example.com`,
                    slug: authorSlug,
                    name: contributor.fullOrUserName
                }
            };
            post.data.authors.push(authorObject);
            debug(`Adding contributor to ${data.slug} post object`, authorObject);
        });
    }

    if (addPrimaryTag) {
        let tagObject = {
            url: `/tag/${slugify(addPrimaryTag)}`,
            data: {
                slug: slugify(addPrimaryTag),
                name: addPrimaryTag
            }
        };
        post.data.tags.push(tagObject);
        debug(`Adding supplied primary tag to ${data.slug} post object`, tagObject);
    }

    if (data?.source?.communityGroups) {
        data.source.communityGroups.forEach((tag) => {
            let tagSlug = slugify(tag.name);
            let tagObject = {
                url: `migrator-added-tag-${tagSlug}`,
                data: {
                    slug: tagSlug,
                    name: tag.name
                }
            };
            post.data.tags.push(tagObject);
            debug(`Adding tag to ${data.slug} post object`, tagObject);
        });
    }

    post.data.tags.push({
        url: `migrator-added-tag-hash-chorus`,
        data: {
            slug: 'hash-chorus',
            name: '#chorus'
        }
    });

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = processContent(data.source.body.components, options);

    return post;
};

const processPosts = (posts, options) => {
    return posts.map(post => processPost(post, options));
};

const all = ({result, options}) => {
    const output = {
        posts: processPosts(result.posts, options)
    };

    return output;
};

export default {
    processContent,
    processPost,
    processPosts,
    all
};
