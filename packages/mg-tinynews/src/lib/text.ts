import type {TinyNewsBlock, TinyNewsChild} from './types.js';

// No space is added before a child that starts with one of these
const supportedPunctuation = [',', '.', '?', '!', ';', ':', '"', '“', '”', ')'];
// or after a child that ends with one of these
const supportedTrailingPunctuation = ['?', '!', ';', '"', '“', '”', '('];

const WRAPPERS: Record<string, string> = {
    TITLE: 'h1',
    SUBTITLE: 'h2',
    HEADING_1: 'h1',
    HEADING_2: 'h2',
    HEADING_3: 'h3',
    HEADING_4: 'h4',
    NORMAL_TEXT: 'p',
    FORMATTED_TEXT: 'pre'
};

/** One child of a text block, which has nonempty `content`. */
const processChild = (child: TinyNewsChild & {content: string}, nextChild: TinyNewsChild | undefined): string => {
    const nextContent = nextChild?.content;
    let delimiterSpaceChar = ' ';

    if (
        (nextContent && supportedPunctuation.includes(nextContent[0])) ||
        supportedTrailingPunctuation.includes(child.content.slice(-1))
    ) {
        delimiterSpaceChar = '';
    }

    let text = `${child.content}${child.link ? '' : delimiterSpaceChar}`;

    if (child.content.trim().length === 0 && nextContent && nextContent.trim().length !== 0) {
        text = '<br />';
    }

    if (child.style) {
        if (child.style.underline && !child.link) {
            text = `${delimiterSpaceChar}<u>${text}</u>${delimiterSpaceChar}`;
        }
        if (child.style.italic) {
            text = `<em>${text}</em>${delimiterSpaceChar}`;
        }
        if (child.style.bold) {
            text = `<strong>${text}</strong>${delimiterSpaceChar}`;
        }
    } else {
        text = `${text}${child.link ? '' : delimiterSpaceChar}`;
    }

    if (child.link) {
        text = `${delimiterSpaceChar}<a href="${child.link}">${text}</a>${delimiterSpaceChar}`;
    }

    return text;
};

/** A text block as a heading, paragraph or preformatted block, or `null` when it has no text. */
const TextNode = ({node}: {node: TinyNewsBlock}): string | null => {
    const nodeChildren = node.children ?? [];
    const children = nodeChildren
        .filter(
            (child): child is TinyNewsChild & {content: string} =>
                Boolean(child.content) && child.content !== 'FORMAT START' && child.content !== 'FORMAT END'
        )
        // The next child is looked up among all children, including those left out.
        .map((child, i) => processChild(child, nodeChildren[i + 1]));

    if (children.length === 0) {
        return null;
    }

    const tag = WRAPPERS[node.style ?? ''];
    return tag ? `<${tag}>${children.join('')}</${tag}>` : children.join('');
};

export {TextNode};
