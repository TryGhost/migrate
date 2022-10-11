import processPost from './process-post.js';
import processProfile from './process-profile.js';

export default (input) => {
    let output = {};

    if (input.profile) {
        output.users = [processProfile(input.profile)];
    }

    let globalUser = output.users && output.users.length === 1 ? output.users[0] : null;

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost(post.name, post.html, globalUser));
    }

    return output;
};
