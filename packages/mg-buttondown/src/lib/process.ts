import MarkdownIt from 'markdown-it';
import MarkdownItFootnote from 'markdown-it-footnote';
import {domUtils} from '@tryghost/mg-utils';

const {serializeChildren, replaceWith, insertBefore, insertAfter, wrap, createElement} = domUtils;

const MEDIA = 'img, picture, video, audio, iframe, embed, object, svg';

/**
 * `html` without comments, including multi-line ones. A `<!--` with no `-->` after it is kept. Removing a comment can
 * join the text around it into a new `<!--`, so the search resumes just before the removed comment.
 */
const stripComments = (html: string): string => {
    let result = html;
    let start = result.indexOf('<!--');
    while (start !== -1) {
        const end = result.indexOf('-->', start + 4);
        if (end === -1) {
            break;
        }
        result = result.slice(0, start) + result.slice(end + 3);
        start = result.indexOf('<!--', Math.max(0, start - 3));
    }
    return result;
};

/**
 * Convert an email body from a Buttondown export, Markdown that may hold HTML, to Ghost HTML: comments are removed,
 * embedded tweets become embed cards, footnotes become an HTML card, and `{{ subscribe_form }}` and empty
 * paragraphs are removed.
 */
const processHTML = (markdown: string): string => {
    const md = new MarkdownIt({
        html: true
    }).use(MarkdownItFootnote);

    if (!markdown) {
        return '';
    }

    let renderedHtml = md.render(stripComments(markdown));

    let finalHtml = domUtils.processFragment(renderedHtml, parsed => {
        // Handle embedded tweets
        parsed.$('blockquote.twitter-tweet').forEach(el => {
            const figure = createElement(parsed.document, 'figure', {class: 'kg-card kg-embed-card'});
            const script = createElement(parsed.document, 'script', {
                async: '',
                src: 'https://platform.twitter.com/widgets.js',
                charset: 'utf-8'
            });

            wrap(el, figure);
            figure.appendChild(script);
            insertBefore(figure, '<!--kg-card-begin: embed-->');
            insertAfter(figure, '<!--kg-card-end: embed-->');
        });

        // Move the .footnotes-sep HR so it's inside the .footnotes element
        parsed.$('.footnotes-sep').forEach(el => {
            const footnotes = parsed.$('.footnotes')[0];
            if (footnotes) {
                footnotes.insertBefore(el, footnotes.firstChild);
            }
        });

        // Wrap footnotes in a HTML card
        parsed.$('.footnotes').forEach(el => {
            insertBefore(el, '<!--kg-card-begin: html-->');
            insertAfter(el, '<!--kg-card-end: html-->');
        });

        parsed.$('p').forEach(el => {
            if ((el.textContent || '').includes('{{ subscribe_form }}')) {
                el.remove();
            }
        });

        // Remove empty paragraphs, but keep those that only hold media, such as a Markdown image.
        parsed.$('p').forEach(el => {
            if ((el.textContent || '').trim().length === 0 && !el.querySelector(MEDIA)) {
                el.remove();
            }
        });

        return parsed.html();
    });

    return finalHtml;
};

export {processHTML};
