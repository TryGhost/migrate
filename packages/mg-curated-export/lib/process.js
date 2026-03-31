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
        output.posts = [];
        for (let i = 0; i < input.posts.length; i++) {
            if (input.posts[i]) {
                output.posts.push(processPost(input.posts[i].json, globalUser, tags, ctx));
                input.posts[i] = null;
            }
        }
    }

    return output;
};
