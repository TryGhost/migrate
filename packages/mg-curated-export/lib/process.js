const processPost = require('./process-post');
const {slugify} = require('@tryghost/string');

module.exports = (input, ctx) => {
    let output = {};

    const userSlug = slugify(ctx.options.name);

    let globalUser = {
        url: userSlug,
        data: {
            slug: userSlug,
            name: ctx.options.name,
            email: ctx.options.email
        }
    };

    let tags = [];

    if (ctx.options.tag) {
        tags.push({
            data: {
                name: ctx.options.tag
            }
        });
    }

    tags.push({
        data: {
            name: '#curated'
        }
    });

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost(post.json, globalUser, tags, ctx));
    }

    return output;
};
