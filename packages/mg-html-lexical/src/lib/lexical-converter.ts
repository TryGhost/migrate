import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Lexical ships separate dev and prod builds, and its entry point picks the dev
 * one when `NODE_ENV` is "development" (which `pnpm dev` sets). That build
 * validates every registered node on each `createEditor()` call, and Ghost's
 * Koenig nodes are built by a factory so they fail its `hasOwnProperty` checks
 * — roughly 100 lines of unactionable warnings per converted post.
 *
 * Requiring it with `NODE_ENV` temporarily unset loads the prod build instead.
 * Lexical is resolved through a single realpath, so the first require decides
 * the build for the whole process and the value is restored immediately after.
 */
export const loadLexicalConverter = () => {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment) {
        delete process.env.NODE_ENV;
    }

    try {
        return require('@tryghost/kg-html-to-lexical') as typeof import('@tryghost/kg-html-to-lexical');
    } finally {
        if (isDevelopment) {
            process.env.NODE_ENV = 'development';
        }
    }
};

const lexicalConverter = loadLexicalConverter();

export default lexicalConverter;
