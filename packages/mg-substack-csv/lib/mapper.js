const {formatISO} = require('date-fns');
const _ = require('lodash');

const mapConfig = (data, {url, readPosts, email}) => {
    const slug = data.post_id.replace(/^(?:\d{1,10}\.)(\S*)/gm, '$1');

    // Get an ISO 8601 date - https://date-fns.org/docs/formatISO
    const dateNow = formatISO(new Date());

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
                    url: `${url}/tag/newsletter`,
                    data: {
                        name: _.startCase(data.type)
                    }
                }
            ]
        }
    };

    if (email) {
        const authorSlug = email.replace(/(^[\w_-]*)(@[\w_-]*\.\w*(?:\.\w{0,2})?)/, '$1');

        mappedData.data.author = {
            url: `${url}/author/${authorSlug}`,
            data: {
                email: email,
                slug: authorSlug
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
        return new Error('Input file is empty');
    }

    if (!options.drafts) {
        input = input.filter(data => data.is_published.toLowerCase() === `true`);
    }

    await input.forEach((data) => {
        output.posts.push(mapConfig(data, options));
    });

    return output;
};
