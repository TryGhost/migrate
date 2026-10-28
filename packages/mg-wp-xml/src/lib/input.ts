import {resolve} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import errors from '@tryghost/errors';

export interface SourceFile {
    path: string;
    name: string;
}
export interface WordPressInput {
    files: SourceFile[];
}

export async function inspectSource(input: string): Promise<WordPressInput> {
    const files: SourceFile[] = await fsUtils.listInputFiles(input, '**/*.xml');
    if (!files.length) {
        throw new errors.NoContentError({message: `No XML files found in ${resolve(input)}`});
    }
    return {files};
}
