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
        output.posts = input.posts.map(post => processPost(post.fileName, post.fileContents, globalUser, options));
    }

    return output;
};
