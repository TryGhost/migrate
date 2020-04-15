const {slugify} = require('@tryghost/string');

const mapConfig = (data) => {
    return {
        url: `https://thelistener.co/${slugify(data.title)}`,
        data: {
            slug: slugify(data.title),
            published_at: data.post_date,
            title: data.title,
            custom_excerpt: data.subtitle,
            type: 'post',
            html: data.body_html,
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
                    url: `https://thelistener.co/tag/newsletter`,
                    data: {
                        name: data.type
                    }
                }
            ]
        }
    };
};

module.exports = async (input) => {
    const output = {
        posts: []
    };

    if (input.length < 1) {
        return new Error('Input file is empty');
    }

    await input.forEach((data) => {
        output.posts.push(mapConfig(data));
    });

    return output;
};
