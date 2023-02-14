import $ from 'cheerio';
import {slugify} from '@tryghost/string';

const processContent = (html, postUrl, options) => {
    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    // Replace empty paragraphs & list items
    html = html.replace(/<p><br><\/p>/g, '');
    html = html.replace(/<li><br><\/li>/g, '');

    const $html = $.load(html, {
        decodeEntities: false
    });

    // Letterdrop supplies internal links in post content with `.com/c/`, but post URLs in JSON are `.com/p/`.
    // Lets normalise that
    $html('a').each((i, el) => {
        let href = $(el).attr('href');
        let linkRegEpx = new RegExp(`${options.url}/c/`);
        let newHref = href.replace(linkRegEpx, `${options.url}/p/`);
        $(el).attr('href', newHref);
    });

    // Wrap nested lists in HTML card
    $html('ul li ul, ol li ol, ol li ul, ul li ol').each((i, nestedList) => {
        let $parent = $(nestedList).parentsUntil('ul, ol').parent();
        $parent.before('<!--kg-card-begin: html-->');
        $parent.after('<!--kg-card-end: html-->');
    });

    $html('.quill-upload-image').each((i, el) => {
        let hasFigure = $(el).find('figure');

        if (hasFigure) {
            $(el).replaceWith(hasFigure);
            $(el).removeAttr('style');
            $(el).find('figcaption').removeAttr('style');
        }
    });

    $html('.letterdrop-custom-button').each((i, el) => {
        let aHref = $(el).find('a').attr('href');
        let referralsRegExp = new RegExp(`${options.url}/referrals/[a-zA-Z0-9]{24}`);

        if (aHref.match(referralsRegExp)) {
            $(el).remove();
        }
    });

    // convert HTML back to a string
    html = $html.html();

    return html;
};

const processPost = (data, options) => {
    const {addPrimaryTag} = options;

    const post = {
        url: data.url,
        data: {
            slug: data.slug,
            title: data.title,
            custom_excerpt: data.subtitle || null,
            meta_title: data.metaTitle || null,
            meta_description: data.metaDescription || null,
            status: 'published',
            created_at: data.publishedOn,
            updated_at: data.updated,
            published_at: data.publishedOn,
            feature_image: data.coverImage || null,
            tags: [],
            authors: []
        }
    };

    if (addPrimaryTag) {
        post.data.tags.push({
            url: `/tag/${slugify(addPrimaryTag)}`,
            data: {
                slug: slugify(addPrimaryTag),
                name: addPrimaryTag
            }
        });
    }

    data.tags.forEach((tag) => {
        let tagSlug = slugify(tag);
        post.data.tags.push({
            url: `migrator-added-tag-${tagSlug}`,
            data: {
                slug: tagSlug,
                name: tag
            }
        });
    });

    post.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            slug: 'hash-letterdrop',
            name: '#letterdrop'
        }
    });

    if (data?.author?.name) {
        let authorSlug = slugify(data.author.name);
        post.data.authors.push({
            url: `/author/${authorSlug}`,
            data: {
                email: `${authorSlug}@example.com`,
                slug: authorSlug,
                name: data.author.name
            }
        });
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = processContent(data.body, post.url, options);

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
