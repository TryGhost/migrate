import $ from 'cheerio';
import SimpleDom from 'simple-dom';
import galleryCard from '@tryghost/kg-default-cards/lib/cards/gallery.js';
import bookmarkCard from '@tryghost/kg-default-cards/lib/cards/bookmark.js';
const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

const doReplace = (str) => {
    const replaceParts = [
        [/[\s\n]/g, ''], // Remove spaces
        [/\.$/, ''], // Trim trailing full stop
        [/‘/, '\''], // Convert single opening curly quote to straight quote
        [/’/, '\''], // Convert single closing curly quote to straight quote
        [/“/, '"'], // Convert double opening curly quote to straight quote
        [/”/, '"'] // Convert double closing curly quote to straight quote
    ];

    replaceParts.forEach((re) => {
        str = str.replace(re[0], re[1]);
    });

    return str;
};

const equivalentTitles = (title1, title2) => {
    title1 = doReplace(title1);
    title2 = doReplace(title2);

    return title1 === title2;
};

export default ({content, post}) => {
    let $content = $(content);

    // Medium usually has an hr divider at the very beginning of the content
    // We don't need this so remove it if we find it
    let $firstSection = $content.find('.section--first');
    if ($firstSection.children().first().hasClass('section-divider')) {
        $firstSection.children().first().remove();
    }

    // Sometimes Medium has a duplicate header at the beginning of the content
    // Don't need this either so remove it
    let firstTitle = $content.find('h1, h2, h3, h4, blockquote').first();
    if (equivalentTitles(firstTitle.text(), post.data.title)) {
        $content.find(firstTitle).remove();
    }

    // Remove the subtitle if it's the same as the excerpt
    $content.find('.graf--subtitle').each((i, el) => {
        if (equivalentTitles($(el).text(), post.data.custom_excerpt)) {
            $(el).remove();
        }
    });

    // Convert galleries
    $content.find('.section-inner.sectionLayout--outsetRow').each((i, el) => {
        // Check we're only working with a group of <figure> elements
        const children = $(el).children();
        const childElementTags = children.map((ii, ell) => {
            return ell.tagName.toLowerCase();
        }).get();
        const allFigures = childElementTags.every(e => e === 'figure');

        // If it's all figures
        if (allFigures) {
            let hasCaption = $(el).find('figcaption');
            let caption = hasCaption.length > 0 ? hasCaption.html().trim() : null;

            let cardOpts = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    images: [],
                    caption: caption
                }
            };

            $(el).find('figure').each((iii, elll) => { // eslint-disable-line no-shadow
                let img = $(elll).find('img');
                cardOpts.payload.images.push({
                    row: 0,
                    fileName: img.attr('data-image-id'),
                    src: img.attr('src'),
                    width: img.attr('data-width'),
                    height: img.attr('data-height')
                });
            });

            const galleryHtml = serializer.serialize(galleryCard.render(cardOpts));

            $(el).replaceWith(galleryHtml);
        }
    });

    // Convert Medium bookmarks
    $content.find('.graf--mixtapeEmbed').each((i, el) => {
        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {}
        };

        let href = $(el).find('.markup--anchor').attr('href');
        cardOpts.payload.url = href;

        let src = $(el).find('.js-mixtapeImage').css('background-image').replace(/url\((.*?)\)/, (m, p) => p);
        cardOpts.payload.metadata = {
            url: href,
            title: $(el).find('.markup--strong').text(),
            description: $(el).find('.markup--em').text(),
            thumbnail: src
        };

        const bookmarkHtml = serializer.serialize(bookmarkCard.render(cardOpts));

        $(el).replaceWith(`<!--kg-card-begin: html-->\n${bookmarkHtml}\n<!--kg-card-end: html-->`);
    });

    // Handle blockquotes made of 2 elements
    $content.find('blockquote.graf--pullquote, blockquote.graf--blockquote').each((i, bq) => {
        $(bq).removeAttr('name');
        $(bq).removeAttr('id');
        $(bq).removeAttr('class');

        $(bq).find('a').each((ii, a) => {
            $(a).removeAttr('data-href');
            $(a).removeAttr('class');
        });

        let textElements = [];
        textElements.push($(bq).html().trim());

        if ($(bq).next('.graf-after--pullquote')) {
            const nextElem = $(bq).next('.graf-after--pullquote');
            const nextText = $(nextElem).html();
            if (nextText && nextText.length > 0) {
                textElements.push(nextText.trim());
                $(nextElem).remove();
            }
        }

        $(bq).replaceWith(`<blockquote><p>${textElements.join('<br><br>')}</p></blockquote>`);
    });

    $content.find('pre.graf--pre').each((i, pre) => {
        $(pre).removeAttr('name');
        $(pre).removeAttr('id');
        $(pre).removeAttr('class');
        $(pre).removeAttr('data-code-block-mode');
        $(pre).removeAttr('spellcheck');
        $(pre).html($(pre).html().trim());

        const lang = $(pre).attr('data-code-block-lang');
        $(pre).removeAttr('data-code-block-lang');

        $(pre).find('span.pre--content').each((ii, span) => {
            span.name = 'code';
        });

        $(pre).find('code').each((iii, code) => {
            $(code).removeAttr('name');
            $(code).removeAttr('id');
            $(code).removeAttr('class');

            if (lang && lang.length > 0) {
                $(code).addClass(`language-${lang}`);
            }

            $(code).html($(code).html().replace(/<br>/g, ' \n').trim());
        });
    });

    return $content.html().trim();
};
