import {lstatSync} from 'node:fs';
import {promises as fs} from 'node:fs';
import fg from 'fast-glob';

const readFile = async path => {
    const input = await fs.readFile(path, 'utf-8');
    return input;
};

const readFolder = async path => {
    const entries = await fg(['**/*.xml'], {
        cwd: path,
        absolute: true,
        dot: false
    });

    entries.sort();

    let out = [];

    for (const entry of entries) {
        let data = await readFile(entry);
        out.push(data);
    }

    // Return one string per file. Concatenating raw XML documents produces an
    // invalid document with multiple roots, so the processor parses each
    // document separately and merges the parsed channels
    return out;
};

const detectType = async path => {
    return lstatSync(path).isDirectory() ? 'folder' : 'file';
};

const readFileOrFolder = async path => {
    const type = await detectType(path);
    let output;

    if (type === 'folder') {
        output = await readFolder(path);
    } else if (type === 'file') {
        output = await readFile(path);
    }

    return output;
};

export {readFile, readFolder, detectType, readFileOrFolder};
