const fs = require('fs').promises;
const path = require('path');

const getFiles = async (path) => {
    let filenames = await fs.readdir(path);

    return filenames.filter(filename => filename.match(/\.html/));
};

const readContent = async (path) => {
    return fs.readFile(path, 'utf-8');
};

const readFiles = async (files, postsDir) => {
    const postContent = {};
    for (const file of files) {
        const substackId = file.replace(/\.html/, '');

        postContent[substackId] = await readContent(path.join(postsDir, file));
    }

    return postContent;
};

const processPost = (post) => {
    // TODO: Do stuff here
    return post;
};

module.exports = async (input, {postsDir}) => {
    const output = {};

    if (postsDir) {
        try {
            let postFiles = await getFiles(postsDir);
            let postContent = await readFiles(postFiles, postsDir);

            input.posts.map((post) => {
                post.data.html = postContent[post.substackId];
                delete post.substackId;
            });
        } catch (error) {
            return new Error('Couldn\'t read post files');
        }
    }

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost(post));
    }

    return output;
};
