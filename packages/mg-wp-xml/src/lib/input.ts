import {stat} from 'node:fs/promises';
import {basename, relative, resolve} from 'node:path';
import fg from 'fast-glob';
import errors from '@tryghost/errors';

export interface SourceFile {
    path: string;
    name: string;
}
export interface WordPressInput {
    files: SourceFile[];
}

export async function inspectSource(input: string): Promise<WordPressInput> {
    const path = resolve(input);
    const directory = (await stat(path)).isDirectory();
    const paths = directory ? await fg('**/*.xml', {cwd: path, absolute: true, dot: false}) : [path];
    paths.sort();
    if (!paths.length) {
        throw new errors.NoContentError({message: `No XML files found in ${path}`});
    }
    const files: SourceFile[] = [];
    for (const file of paths) {
        const name = directory ? relative(path, file).split('\\').join('/') : basename(file);
        files.push({path: file, name});
    }
    return {files};
}
