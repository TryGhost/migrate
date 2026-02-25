import {lstatSync} from 'node:fs';
import {promises as fs} from 'node:fs';
import fg from 'fast-glob';

const readFile = async (path) => {
    const input = await fs.readFile(path, 'utf-8');
    return input;
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

    // When reading multiple files, we need to merge them
    // Extract channel content from each and combine
    return out.join('');
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

    return output;
};

export {
    readFile,
    readFolder,
    detectType,
    readFileOrFolder
};
