const string = require('@tryghost/string');
const fm = require('front-matter');
const processContent = require('./process-content');

const processMeta = (fileName, markdown, options) => {
    const isDraft = fileName.startsWith('drafts/');

    let frontmatter = fm(markdown);
    let frontmatterAttributes = frontmatter.attributes;

    let postDate = false;
    let slugParts = false;
    let postType = 'post';
    let postSlug = false;
    let nonStandardPostType = false;

    // Get an ISO 8601 date
    const dateNow = new Date().toISOString();

    if (isDraft) {
        const slugRegex = new RegExp('(drafts/)(.*).md');
        slugParts = fileName.match(slugRegex);
        postSlug = slugParts[2];
    } else if (frontmatterAttributes.date) {
        const frontMaterDateRegex = new RegExp('([0-9]{4})[-:/\\ ]([0-9]{2})[-:/\\ ]([0-9]{2})');
        const dateParts = frontmatterAttributes.date.match(frontMaterDateRegex);
        postDate = new Date(Date.UTC(dateParts[1], (dateParts[2] - 1), dateParts[3], 12, 0, 0)); // Months are zero-index, so 12 equals December

        const slugRegex = new RegExp('([0-9a-zA-Z-_]+)/(.*).md');
        slugParts = fileName.match(slugRegex);
        postSlug = slugParts[2];
    } else {
        const datedSlugRegex = new RegExp('([0-9a-zA-Z-_]+)/([0-9]{4}-[0-9]{1,2}-[0-9]{1,2})-(.*).md');
        slugParts = fileName.match(datedSlugRegex);

        if (slugParts[1] !== 'posts') {
            postType = slugParts[1];
            nonStandardPostType = true;
        }

        // The file could have a date like `2018-8-9`, so split it up and reassemble in a format we can use
        const dateYear = slugParts[2].split(/[-/]/)[0];
        const dateMonth = ('0' + slugParts[2].split(/[-/]/)[1]).slice(-2);
        const dateDay = ('0' + slugParts[2].split(/[-/]/)[2]).slice(-2);
        postDate = new Date(Date.UTC(dateYear, (dateMonth - 1), dateDay, 12, 0, 0)); // Months are zero-index, so 12 equals December
        postSlug = slugParts[3];
    }

    const post = {
        url: (options && options.url) ? `${options.url.replace(/^\/|\/$/g, '')}/${postSlug.replace(/^\/|\/$/g, '')}` : postSlug, // Combine URL & slug, and replace extra slashes
        data: {
            slug: postSlug
        }
    };

    post.data.status = 'published';
    post.data.created_at = postDate || dateNow;
    post.data.published_at = postDate || dateNow;
    post.data.updated_at = postDate || dateNow;

    post.data.type = 'post';
    post.data.status = (isDraft) ? 'draft' : 'published';

    post.data.email_only = false;

    post.data.title = frontmatterAttributes.title || '(Untitled)';

    if (frontmatterAttributes.author) {
        post.data.author = {
            url: string.slugify(frontmatterAttributes.author),
            data: {
                email: `${string.slugify(frontmatterAttributes.author)}@${(options.email) ? options.email : 'dummyemail.com'}`,
                name: frontmatterAttributes.author,
                slug: string.slugify(frontmatterAttributes.author),
                roles: [
                    'Contributor'
                ]
            }
        };
    }

    // Add post-specific tags
    post.data.tags = [];

    if (nonStandardPostType) {
        let typeTagSlug = `hash-${string.slugify(postType)}`;
        post.data.tags.push({
            url: `migrator-added-tag-${typeTagSlug}`,
            data: {
                name: `#${postType}`,
                slug: typeTagSlug
            }
        });
    }

    return post;
};

module.exports = (fileName, markdown, globalUser = false, options = {}) => {
    const post = processMeta(fileName, markdown, options);

    // Process content
    post.data.html = processContent(markdown, options);

    // Process author
    if (!post.data.author) {
        post.data.author = globalUser;
    }

    // Add extra tags
    post.data.tags.push({
        url: 'migrator-added-tag', data: {
            name: '#jekyll',
            slug: 'hash-jekyll'
        }
    });

    if (options.addTags) {
        let theTags = options.addTags.split(',').map(item => item.trim());

        theTags.forEach((tag) => {
            let tagSlug = string.slugify(tag.replace('#', 'hash-'));

            post.data.tags.push({
                url: `migrator-added-tag-${tagSlug}`,
                data: {
                    name: tag,
                    slug: tagSlug
                }
            });
        });
    }

    return post;
};
