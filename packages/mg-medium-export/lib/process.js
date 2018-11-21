const processPost = require('./process-post');
const processProfile = require('./process-profile');

module.exports = (input) => {
    let output = {};

    if (input.profile) {
        output.users = [processProfile(input.profile)];
    }

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost(post.name, post.html));
    }

    return output;
};
