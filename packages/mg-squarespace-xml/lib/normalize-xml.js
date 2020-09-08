const $ = require('cheerio');
const {slugify} = require('@tryghost/string');

const processUser = (sqUser) => {
    const authorSlug = slugify($(sqUser).children('wp\\:author_login').text());

    return {
        url: authorSlug,
        data: {
            slug: authorSlug,
            name: $(sqUser).children('wp\\:author_display_name').text(),
            email: $(sqUser).children('wp\\:author_email').text()
        }
    };
};

const processFeatureImage = (sqPost) => {
    const $nextItem = $(sqPost).next().children('wp\\:attachment_url');

    if ($nextItem.length >= 1) {
        return $nextItem.text();
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
        } else if ($(taxonomy).attr('domain') === 'post_tag') {
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

const processPost = (sqPost, users, {addTag, tags: fetchTags}) => {
    const postType = $(sqPost).children('wp\\:post_type').text();

    if (postType !== 'attachment') {
        const featureImage = processFeatureImage(sqPost);
        const authorSlug = slugify($(sqPost).children('dc\\:creator').text());

        const post = {
            url: $(sqPost).children('link').text(),
            data: {
                slug: $(sqPost).children('wp\\:post_name').text().replace(/(\.html)$/i, ''),
                title: $(sqPost).children('title').text(),
                html: $.html($(sqPost).children('content\\:encoded')),
                status: $(sqPost).children('wp\\:status').text() === 'publish' ? 'published' : 'draft',
                published_at: $(sqPost).children('wp\\:post_date_gmt').text(),
                feature_image: featureImage,
                tags: [],
                type: postType,
                author: users ? users.find(user => user.data.slug === authorSlug) : null
            }
        };

        if ($(sqPost).children('category').length >= 1) {
            post.data.tags = processTags($(sqPost).children('category'), fetchTags);
        }

        post.data.tags.push({
            url: 'migrator-added-tag', data: {name: '#sqs'}
        });

        if (addTag) {
            post.data.tags.push({
                url: 'migrator-added-tag-2', data: {slug: addTag, name: addTag}
            });
        }

        if (!post.data.author) {
            if ($(sqPost).children('dc\\:creator').length >= 1) {
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
                        slug: 'dummy-author@dummyemail.com'
                    }
                };
            }
        }

        return post;
    }

    return;
};

module.exports = async (input, {options}) => {
    const output = {
        posts: [],
        users: []
    };

    if (input.length < 1) {
        return new Error('Input file is empty');
    }

    const $file = $.load(input, {
        decodeEntities: false,
        xmlMode: true
    });

    const sourceUrl = $file('channel > link').text();

    $file('wp\\:author').each((i, sqUser) => {
        output.users.push(processUser(sqUser));
    });

    $file('item').each((i, sqPost) => {
        const processedPost = processPost(sqPost, output.users, options, sourceUrl);

        if (processedPost) {
            output.posts.push(processedPost);
        }
    });

    return output;
};
