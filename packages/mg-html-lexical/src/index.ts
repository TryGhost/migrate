import {convert} from './lib/convert.js';
import {convertPost} from './lib/convert-post.js';
import lexicalConverter from './lib/lexical-converter.js';

// Understands the data formats, so knows where to look for posts to convert
export default {
    convert
};

const {htmlToLexical} = lexicalConverter;

export {convert, convertPost, htmlToLexical};
