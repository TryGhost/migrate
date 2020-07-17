const fs = require('fs').promises;
const path = require('path');
const $ = require('cheerio');

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

const processContent = (html) => {
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    $html('a > style').each((i, style) => {
        $(style).remove();
    });

    // convert HTML back to a string
    html = $html.html();

    return html;
};

const processPost = (post) => {
    post.data.html = processContent(post.data.html);

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
