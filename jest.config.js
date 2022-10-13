// Extra assertions are from https://github.com/jest-community/jest-extended
import {join} from 'node:path';
import {URL} from 'node:url';
const __dirname = new URL('.', import.meta.url).pathname;

export default async () => {
    return {
        verbose: true,
        setupFilesAfterEnv: ['jest-extended/all'],
        resolver: join(__dirname, 'test/utils/resolver.cjs')
    };
};
