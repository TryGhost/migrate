import * as cheerio from 'cheerio';
import {readFile} from './read-file.js';

const contentStats = async (xmlPath) => {
    const input = await readFile(xmlPath);

    const $xml = cheerio.load(input, {
        decodeEntities: false,
        xmlMode: true,
        scriptingEnabled: false,
        lowerCaseTags: true
    }, false);

    let postsOutput = [];
    let pagesOutput = [];

    $xml('item').each((i, post) => {
        const postType = $xml(post).children('wp\\:post_type').text();
        const postLink = $xml(post).children('link').text();

        if (postType === 'post') {
            postsOutput.push(postLink);
        } else if (postType === 'page') {
            pagesOutput.push(postLink);
        }
    });

    return {
        posts: postsOutput.length,
        pages: pagesOutput.length
    };
};

export {
    contentStats
};
