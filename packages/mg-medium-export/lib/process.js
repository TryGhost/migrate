import processPost from './process-post.js';
import processProfile from './process-profile.js';

export default (input, options) => {
    let output = {};

    if (input.profile || input.profiles) {
        output.users = [processProfile({html: input.profile || input.profiles})];
    }

    let globalUser = output.users && output.users.length === 1 ? output.users[0] : null;

    if (input.posts && input.posts.length > 0) {
        output.posts = [];
        for (let i = 0; i < input.posts.length; i++) {
            if (input.posts[i]) {
                output.posts.push(processPost({name: input.posts[i].name, html: input.posts[i].html, globalUser, options}));
                input.posts[i] = null;
            }
        }
    }

    return output;
};
