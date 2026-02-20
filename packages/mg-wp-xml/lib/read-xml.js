import {XMLParser} from 'fast-xml-parser';
import {readFile} from './read-file.js';

const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false
};

const contentStats = async (xmlPath) => {
    const input = await readFile(xmlPath);

    const parser = new XMLParser(parserOptions);
    const xml = parser.parse(input);

    const items = xml?.rss?.channel?.item || [];
    // Ensure items is always an array (single item becomes object)
    const itemsArray = Array.isArray(items) ? items : [items];

    let postsCount = 0;
    let pagesCount = 0;

    for (const item of itemsArray) {
        const postType = item['wp:post_type'];

        if (postType === 'post') {
            postsCount += 1;
        } else if (postType === 'page') {
            pagesCount += 1;
        }
    }

    return {
        posts: postsCount,
        pages: pagesCount
    };
};

export {
    contentStats
};
