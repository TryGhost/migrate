const processPost = require('./process-post');

module.exports = (input, options = {}) => {
    let output = {};

    let globalUser = {
        url: `/author/dummyuser`,
        data: {
            email: `dummyuser@dummyemail.com`,
            name: 'Dummy User',
            slug: 'dummyuser',
            roles: [
                'Contributor'
            ]
        }
    };

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost(post.fileName, post.markdown, globalUser, options));
    }

    return output;
};
