import {lstatSync} from 'node:fs';
import {promises as fs} from 'node:fs';
import * as cheerio from 'cheerio';
import fg from 'fast-glob';

const readFile = async (path) => {
    const input = await fs.readFile(path, 'utf-8');

    const $xml = cheerio.load(input, {
        decodeEntities: false,
        xmlMode: true,
        lowerCaseTags: true
    }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

    let out = $xml('channel').html();

    return out;
};

const readFolder = async (path) => {
    const entries = await fg(['**/*.xml'], {
        cwd: path,
        absolute: true,
        dot: false
    });

    let out = [];

    for (const entry of entries) {
        let data = await readFile(entry);
        out.push(data);
    }
    return out.join('');
};

const prepForOutput = (input) => {
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/"><channel>${input}</channel></rss>`;
};

const detectType = async (path) => {
    return lstatSync(path).isDirectory() ? 'folder' : 'file';
};

const readFileOrFolder = async (path) => {
    const type = await detectType(path);
    let output;

    if (type === 'folder') {
        output = await readFolder(path);
    } else if (type === 'file') {
        output = await readFile(path);
    }

    return prepForOutput(output);
};

export {
    readFile,
    readFolder,
    detectType,
    readFileOrFolder
};
