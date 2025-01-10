import {extname} from 'path';
import $ from 'cheerio';
import {slugify} from '@tryghost/string';
import MgWpAPI from '@tryghost/mg-wp-api';
import errors from '@tryghost/errors';

const htmlToTextTrimmed = (html, max) => {
    let noHtml = html.replace(/<[^>]+>/g, ' ').replace(/\r?\n|\r/g, ' ').replace(/ {2,}/, ' ').trim();
    return noHtml && noHtml.length > max ? noHtml.slice(0,max).split(' ').slice(0, -1).join(' ') : noHtml;
};

const processUser = ($sqUser) => {
    const authorSlug = slugify($($sqUser).children('wp\\:author_login').text());

    return {
        url: authorSlug,
        data: {
            slug: authorSlug,
            name: $($sqUser).children('wp\\:author_display_name').text(),
            email: $($sqUser).children('wp\\:author_email').text()
        }
    };
};

const processContent = async (html, options) => {
    if (!html) {
        return '';
    }

    let processedContent = await MgWpAPI.process.processContent({
        html: html,
        options: options
    });

    return processedContent;
};

// The feature images is not "connected" to the post, other than it's located
// in the sibling `<item>` node.
const processFeatureImage = ($sqPost) => {
    const $nextItem = $($sqPost).next().children('wp\\:attachment_url');

    if ($nextItem.length >= 1) {
        let itemText = $nextItem.text();
        let itemExt = extname(itemText);
        let allowedExt = ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz', '.ico', '.webp'];

        if (allowedExt.includes(itemExt) || itemText.includes('images.unsplash.com')) {
            return $nextItem.text();
        }
    }

    return;
};

const processTags = ($sqCategories, fetchTags) => {
    const categories = [];
    const tags = [];

    $sqCategories.each((i, taxonomy) => {
        if (fetchTags && $(taxonomy).attr('domain') === 'post_tag') {
            tags.push({
                url: `/tag/${$(taxonomy).attr('nicename')}`,
                data: {
                    slug: $(taxonomy).attr('nicename'),
                    name: $(taxonomy).text()
                }
            });
        } else if ($(taxonomy).attr('domain') === 'category') {
            categories.push({
                url: `/tag/${$(taxonomy).attr('nicename')}`,
                data: {
                    slug: $(taxonomy).attr('nicename'),
                    name: $(taxonomy).text()
                }
            });
        }
    });

    return categories.concat(tags);
};

const processPost = async ($sqPost, users, options) => {
    const {addTag, tags: fetchTags, url} = options;
    const postType = $($sqPost).children('wp\\:post_type').text();

    // only grab posts and pages
    if (postType !== 'attachment') {
        const featureImage = processFeatureImage($sqPost);
        const authorSlug = slugify($($sqPost).children('dc\\:creator').text());
        let postSlug = $($sqPost).children('link').text();
        postSlug = postSlug.replace(/(\.html)/i, '');
        postSlug = postSlug.split('/').pop();

        if (!postSlug || postSlug.indexOf('null') >= 0) {
            // drafts can have a post slug/link of `/null`
            postSlug = 'untitled';
        }

        // WP XML only provides a published date, we let's use that all dates Ghost expects
        const postDate = new Date($($sqPost).children('pubDate').text());

        const postTitle = ($($sqPost).children('title').text().length > 0) ? $($sqPost).children('title').text() : false;

        const post = {
            url: `${url}${$($sqPost).children('link').text()}`,
            data: {
                slug: postSlug,
                title: postTitle,
                status: $($sqPost).children('wp\\:status').text() === 'publish' ? 'published' : 'draft',
                published_at: postDate,
                created_at: postDate,
                updated_at: postDate,
                feature_image: featureImage,
                type: postType,
                author: users ? users.find(user => user.data.slug === authorSlug) : null,
                tags: []
            }
        };

        post.data.html = await processContent($($sqPost).children('content\\:encoded').text(), options);

        if ($($sqPost).children('category').length >= 1) {
            post.data.tags = processTags($($sqPost).children('category'), fetchTags);
        }

        if (addTag) {
            post.data.tags.push({
                url: 'migrator-added-tag', data: {slug: addTag, name: addTag}
            });
        }

        post.data.tags.push({
            url: 'migrator-added-tag-sqs', data: {name: '#sqs'}
        });

        if (!postTitle) {
            post.data.tags.push({
                url: 'migrator-added-tag-no-title', data: {name: '#no-title'}
            });

            post.data.title = htmlToTextTrimmed(post.data.html, 50);
        }

        if (!post.data.author) {
            if ($($sqPost).children('dc\\:creator').length >= 1) {
                post.data.author = {
                    url: authorSlug,
                    data: {
                        slug: authorSlug
                    }
                };
            } else {
                post.data.author = {
                    url: 'migrator-added-author',
                    data: {
                        slug: 'migrator-added-author'
                    }
                };
            }
        }

        return post;
    }
};

const processPosts = async ($xml, users, options) => {
    const postsOutput = [];

    const allProcessed = $xml('item').map(async (i, sqPost) => {
        postsOutput.push(await processPost(sqPost, users, options));
    }).get();

    await Promise.all(allProcessed);

    // don't return empty post objects
    return postsOutput.filter(post => post);
};

const processUsers = ($xml) => {
    const usersOutput = [];

    $xml('wp\\:author').each((i, sqUser) => {
        usersOutput.push(processUser(sqUser));
    });

    return usersOutput;
};

const all = async (input, {options}) => {
    const {drafts, posts, pages} = options;
    const output = {
        posts: [],
        users: []
    };

    if (input.length < 1) {
        return new errors.NoContentError({message: 'Input file is empty'});
    }

    const $xml = $.load(input, {
        decodeEntities: false,
        xmlMode: true,
        scriptingEnabled: false,
        lowerCaseTags: true // needed to find `pubDate` tags
    }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced
    // });

    // grab the URL of the site we're importing
    options.url = $xml('channel > link').text();

    // process users first, as we're using this information
    // to populate the author data for posts
    output.users = processUsers($xml);

    output.posts = await processPosts($xml, output.users, options);

    if (!drafts) {
        // remove draft posts
        output.posts = output.posts.filter(post => post.data.status !== 'draft');
    }

    if (!posts) {
        // remove posts
        output.posts = output.posts.filter(post => post.data.type !== 'post');
    }

    if (!pages) {
        // remove pages
        output.posts = output.posts.filter(post => post.data.type !== 'page');
    }

    return output;
};

export default {
    processUser,
    processContent,
    processFeatureImage,
    processTags,
    processPost,
    processPosts,
    processUsers,
    all
};
