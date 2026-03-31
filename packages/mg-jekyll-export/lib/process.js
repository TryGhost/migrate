import processPost from './process-post.js';

export default (input, options = {}) => {
    let output = {};

    let globalUser = {
        url: `/author/exampleuser`,
        data: {
            email: `exampleuser@example.com`,
            name: 'Example User',
            slug: 'exampleuser',
            roles: [
                'Contributor'
            ]
        }
    };

    if (input.posts && input.posts.length > 0) {
        output.posts = [];
        for (let i = 0; i < input.posts.length; i++) {
            if (input.posts[i]) {
                output.posts.push(processPost(input.posts[i].fileName, input.posts[i].fileContents, globalUser, options));
                input.posts[i] = null;
            }
        }
    }

    return output;
};
