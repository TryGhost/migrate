const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({
    html: true
});
const string = require('@tryghost/string');
const errors = require('@tryghost/errors');
const fm = require('front-matter');
const processHtml = require('./process-html');

/*
Process both the frontmatter metadata and content of a single Jekyll Markdown post.

The body may be ein Markdown or HTML.
*/

const processMeta = (fileName, fileContents, options) => {
    const inDraftsDir = fileName.startsWith('_drafts/');

    let frontmatter = fm(fileContents);
    let frontmatterAttributes = frontmatter.attributes;

    let postDate = false;
    let slugParts = false;
    let postType = 'post';
    let postSlug = false;
    let nonStandardPostType = false;

    // Get an ISO 8601 date
    const dateNow = new Date().toISOString();

    if (inDraftsDir) {
        const slugRegex = new RegExp('(_drafts/)(.*).(md|markdown|html)');
        slugParts = fileName.match(slugRegex);
        postSlug = slugParts[2];
    } else if (frontmatterAttributes.date) {
        // The date was unquoted in the frontmatter, it gets parsed into a data object
        if (typeof frontmatterAttributes.date === 'object') {
            postDate = frontmatterAttributes.date;
        // Otherwise the date gets parsed as a string
        } else {
            const frontMaterDateRegex = new RegExp('([0-9]{4})[-:/\\ ]([0-9]{2})[-:/\\ ]([0-9]{2})');
            // console.warn(`GOT ${typeof frontmatterAttributes.date}`)

            const dateParts = frontmatterAttributes.date.match(frontMaterDateRegex);
            postDate = new Date(Date.UTC(dateParts[1], (dateParts[2] - 1), dateParts[3])); // Months are zero-index, so 11 equals December
        }
        const slugRegex = new RegExp('([0-9a-zA-Z-_]+)/(.*).(md|markdown|html)');
        slugParts = fileName.match(slugRegex);
        postSlug = slugParts[2];
    } else {
        const datedSlugRegex = new RegExp('([0-9a-zA-Z-_]+)/([0-9]{4}-[0-9]{1,2}-[0-9]{1,2})-(.*).(md|markdown|html)');
        slugParts = fileName.match(datedSlugRegex);

        if (slugParts[1] !== '_posts') {
            postType = slugParts[1];
            nonStandardPostType = true;
        }

        // The file could have a date like `2018-8-9`, so split it up and reassemble in a format we can use
        const dateYear = slugParts[2].split(/[-/]/)[0];
        const dateMonth = ('0' + slugParts[2].split(/[-/]/)[1]).slice(-2);
        const dateDay = ('0' + slugParts[2].split(/[-/]/)[2]).slice(-2);
        postDate = new Date(Date.UTC(dateYear, (dateMonth - 1), dateDay)); // Months are zero-index, so 11 equals December
        postSlug = slugParts[3];
    }

    const post = {
        url: (options && options.url) ? `${options.url.replace(/^\/|\/$/g, '')}/${postSlug.replace(/^\/|\/$/g, '')}` : postSlug, // Combine URL & slug, and replace extra slashes
        data: {
            slug: postSlug
        }
    };

    const isDraft = (inDraftsDir || frontmatterAttributes.published === false);

    // This will be processed more later and deleted
    post._body = frontmatter.body;

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

    // Add tags ^ categories from front matter
    // `tag` & `category` are interpreted as a single item
    // `tags` & `categories` are interpreted as a list of items
    post.data.tags = [];

    if (frontmatterAttributes.tag) {
        post.data.tags.push({
            url: `migrator-added-tag-${string.slugify(frontmatterAttributes.tag)}`,
            data: {
                name: frontmatterAttributes.tag,
                slug: string.slugify(frontmatterAttributes.tag)
            }
        });
    }

    if (frontmatterAttributes.tags) {
        frontmatterAttributes.tags.split(' ').forEach((tag) => {
            post.data.tags.push({
                url: `migrator-added-tag-${string.slugify(tag)}`,
                data: {
                    name: tag,
                    slug: string.slugify(tag)
                }
            });
        });
    }

    if (frontmatterAttributes.category) {
        post.data.tags.push({
            url: `migrator-added-tag-category-${string.slugify(frontmatterAttributes.category)}`,
            data: {
                name: frontmatterAttributes.category,
                slug: `category-${string.slugify(frontmatterAttributes.category)}`
            }
        });
    }

    if (frontmatterAttributes.categories) {
        frontmatterAttributes.categories.split(' ').forEach((tag) => {
            post.data.tags.push({
                url: `migrator-added-tag-category-${string.slugify(tag)}`,
                data: {
                    name: tag,
                    slug: `category-${string.slugify(tag)}`
                }
            });
        });
    }

    // Add post-specific tags
    if (nonStandardPostType) {
        post.data.tags.push({
            url: `migrator-added-tag-hash-${string.slugify(postType)}`,
            data: {
                name: `#${postType}`,
                slug: `hash-${string.slugify(postType)}`
            }
        });
    }

    return post;
};

module.exports = (fileName, fileContents, globalUser = false, options = {}) => {
    const post = processMeta(fileName, fileContents, options);

    // The post body may be in Markdown or HTML.
    // If it's in Markdown, convert the Markdown to HTML
    const htmlRegex = new RegExp('.*.html$');
    const markdownRegex = new RegExp('.*.(md|markdown)$');
    const isHtml = fileName.match(htmlRegex);
    const isMarkdown = fileName.match(markdownRegex);
    let rawHtml;
    if (isHtml) {
        rawHtml = post._body;
    } else if (isMarkdown) {
        rawHtml = md.render(post._body);
    } else {
        throw new errors.GhostError({
            message: 'Unrecognized file extension. Only .md, .markdown and .html are supported'
        });
    }
    // Now we are done with this temporary attribute
    delete post._body;

    // Clean up the HTML
    post.data.html = processHtml(rawHtml, options);

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
