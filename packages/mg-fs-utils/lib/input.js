import {stat} from 'node:fs/promises';
import {basename, relative, resolve} from 'node:path';
import fg from 'fast-glob';

/**
 * Resolve an input path to the files a source reads: the file itself, or the files under a directory that match
 * `globPattern`, sorted by path so every read sees them in the same order. Hidden files are left out.
 *
 * Each file is `{path, name}`: `path` is absolute, and `name` is the file's base name, or for a directory its path
 * relative to that directory with `/` separators. A directory with no matching files gives an empty list.
 *
 * @param {String} input - path to a file or a directory
 * @param {String} globPattern - fast-glob pattern for the files to read from a directory, such as `*.zip`
 * @returns {Promise<Array<{path: String, name: String}>>}
 */
const listInputFiles = async (input, globPattern) => {
    const path = resolve(input);
    if (!(await stat(path)).isDirectory()) {
        return [{path, name: basename(path)}];
    }
    const paths = await fg(globPattern, {cwd: path, absolute: true, dot: false});
    paths.sort();
    return paths.map(file => ({path: file, name: relative(path, file).split('\\').join('/')}));
};

export {listInputFiles};
