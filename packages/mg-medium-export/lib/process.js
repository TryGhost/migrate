import processPost from './process-post.js';
import processProfile from './process-profile.js';

export default async (input) => {
    let output = {};

    if (input.profile || input.profiles) {
        output.users = [processProfile(input.profile || input.profiles)];
    }

    let globalUser = output.users && output.users.length === 1 ? output.users[0] : null;

    if (input.posts && input.posts.length > 0) {
        output.posts = await Promise.all(input.posts.map(post => processPost(post.name, post.html, globalUser)));
    }

    return output;
};
