import MarkdownIt from 'markdown-it';
import MarkdownItFootnote from 'markdown-it-footnote';
import * as cheerio from 'cheerio';

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

    const $: any = cheerio.load(renderedHtml, {
        xml: {
            xmlMode: false,
            decodeEntities: false
        }
    });

    // Handle embeded tweets
    $('blockquote.twitter-tweet').each((i: any, el: any) => {
        let $figure = $('<figure class="kg-card kg-embed-card"></figure>');
        let $script = $('<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>');

        $(el).wrap($figure);
        $figure.append($script);
        $figure.before('<!--kg-card-begin: embed-->');
        $figure.after('<!--kg-card-end: embed-->');
    });

    // Move the .footnotes-sep HR so it's inside the .footnotes element
    $('.footnotes-sep').each((i: any, el: any) => {
        $(el).prependTo($('.footnotes'));
    });

    // Wrap footnotes in a HTML card
    $('.footnotes').each((i: any, el: any) => {
        $(el).before('<!--kg-card-begin: html-->');
        $(el).after('<!--kg-card-end: html-->');
    });

    $('p').each((i: any, el: any) => {
        if ($(el).text().includes('{{ subscribe_form }}')) {
            $(el).remove();
        }
    });

    $('p').each((i: any, el: any) => {
        if ($(el).text().trim().length === 0) {
            $(el).remove();
        }
    });

    let finalHtml = $.root().html();

    return finalHtml;
};

export {
    processHTML
};
