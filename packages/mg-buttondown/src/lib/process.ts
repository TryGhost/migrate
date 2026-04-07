import MarkdownIt from 'markdown-it';
import MarkdownItFootnote from 'markdown-it-footnote';
import {domUtils} from '@tryghost/mg-utils';

const {serializeChildren, replaceWith, insertBefore, insertAfter, wrap, createElement} = domUtils;

const processHTML = ({postData}: {postData?: mappedDataObject}) => {
    const md = new MarkdownIt({
        html: true
    }).use(MarkdownItFootnote);

    if (!postData?.data?.html) {
        return '';
    }

    let html = postData.data.html;

    // Strip HTML comments
    html = html.replace(/<!--(.*?)-->/gm, '');

    let renderedHtml = md.render(html);

    let finalHtml = domUtils.processFragment(renderedHtml, (parsed) => {
        // Handle embedded tweets
        parsed.$('blockquote.twitter-tweet').forEach((el) => {
            const figure = createElement(parsed.document, 'figure', {class: 'kg-card kg-embed-card'});
            const script = createElement(parsed.document, 'script', {async: '', src: 'https://platform.twitter.com/widgets.js', charset: 'utf-8'});

            wrap(el, figure);
            figure.appendChild(script);
            insertBefore(figure, '<!--kg-card-begin: embed-->');
            insertAfter(figure, '<!--kg-card-end: embed-->');
        });

        // Move the .footnotes-sep HR so it's inside the .footnotes element
        parsed.$('.footnotes-sep').forEach((el) => {
            const footnotes = parsed.$('.footnotes')[0];
            if (footnotes) {
                footnotes.insertBefore(el, footnotes.firstChild);
            }
        });

        // Wrap footnotes in a HTML card
        parsed.$('.footnotes').forEach((el) => {
            insertBefore(el, '<!--kg-card-begin: html-->');
            insertAfter(el, '<!--kg-card-end: html-->');
        });

        parsed.$('p').forEach((el) => {
            if ((el.textContent || '').includes('{{ subscribe_form }}')) {
                el.remove();
            }
        });

        parsed.$('p').forEach((el) => {
            if ((el.textContent || '').trim().length === 0) {
                el.remove();
            }
        });

        return parsed.html();
    });

    return finalHtml;
};

export {
    processHTML
};
