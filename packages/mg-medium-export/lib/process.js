import processPost from './process-post.js';
import processProfile from './process-profile.js';

export default (input, options) => {
    let output = {};

    if (input.profile || input.profiles) {
        output.users = [processProfile({html: input.profile || input.profiles})];
    }

    let globalUser = output.users && output.users.length === 1 ? output.users[0] : null;

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost({name: post.name, html: post.html, globalUser, options}));
    }

    return output;
};
