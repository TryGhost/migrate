import {slugify} from '@tryghost/string';
import processPost from './process-post.js';

export default (input, ctx) => {
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
