const processPost = require('./process-post');

module.exports = (input, ctx) => {
    let output = {};

    let globalUser = output.users && output.users.length === 1 ? output.users[0] : null;

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost(post.name, post.json, globalUser, ctx));
    }

    return output;
};
