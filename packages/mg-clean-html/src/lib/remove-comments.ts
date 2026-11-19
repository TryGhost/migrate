import {domUtils} from '@tryghost/mg-utils';

const {isComment, getCommentData} = domUtils;

const removeCommentNodes = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
        if (isComment(child)) {
            const marker = getCommentData(child).trim();
            if (!marker.startsWith('kg-') && marker !== 'members-only') {
                child.remove();
            }
        } else {
            removeCommentNodes(child);
        }
    }
};

const cleanFragment = (parsed: domUtils.ParsedFragment): string => {
    removeCommentNodes(parsed.body);
    const cleaned = parsed.html();
    return cleaned.trim() === '' ? '' : cleaned;
};

/**
 * Strip ordinary comments, preserving Koenig markers and the members-only paywall.
 * A supplied fragment is cleaned in place. Return an empty string for a blank body.
 */
const removeNonKoenigComments = (html?: string | domUtils.ParsedFragment | null): string => {
    if (html && typeof html !== 'string') {
        return cleanFragment(html);
    }
    if (!html || html.trim() === '') {
        return '';
    }

    if (!html.includes('<!--')) {
        return html;
    }

    return domUtils.processFragment(html, cleanFragment);
};

export {removeNonKoenigComments};
