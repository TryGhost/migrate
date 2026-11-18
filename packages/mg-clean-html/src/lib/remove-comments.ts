import {domUtils} from '@tryghost/mg-utils';

const {isComment, getCommentData} = domUtils;

const removeCommentNodes = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
        if (isComment(child)) {
            if (!getCommentData(child).trim().startsWith('kg-')) {
                child.remove();
            }
        } else {
            removeCommentNodes(child);
        }
    }
};

/**
 * Remove every HTML comment except Koenig card markers (comments starting with `kg-`, such as
 * `<!--kg-card-begin: html-->`). Content made of only comments (e.g. WordPress block comments
 * like `<!-- wp:paragraph -->`) converts to an empty Lexical root, which Ghost rejects, whereas
 * an empty string imports fine. If nothing but whitespace remains, an empty string is returned.
 */
const removeNonKoenigComments = (html?: string | null): string => {
    if (!html || !html.includes('<!--')) {
        return html ?? '';
    }

    const cleaned = domUtils.processFragment(html, parsed => {
        removeCommentNodes(parsed.body);
        return parsed.html();
    });

    return cleaned.trim() === '' ? '' : cleaned;
};

export {removeNonKoenigComments};
