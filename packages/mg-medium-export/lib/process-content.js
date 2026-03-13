import {domUtils} from '@tryghost/mg-utils';
import SimpleDom from 'simple-dom';
import galleryCard from '@tryghost/kg-default-cards/lib/cards/gallery.js';
import bookmarkCard from '@tryghost/kg-default-cards/lib/cards/bookmark.js';
const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

const doReplace = (str) => {
    const replaceParts = [
        [/[\s\n]/g, ''], // Remove spaces
        [/\.$/, ''], // Trim trailing full stop
        [/\u2018/, '\''], // Convert single opening curly quote to straight quote
        [/\u2019/, '\''], // Convert single closing curly quote to straight quote
        [/\u201c/, '"'], // Convert double opening curly quote to straight quote
        [/\u201d/, '"'] // Convert double closing curly quote to straight quote
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

export default ({html, post}) => {
    const parsed = domUtils.parseFragment(html);

    // Detect if post is likely to be a comment. If so, set as draft and add tag
    // Based on being published, content having 1 paragraph, and having no images
    let childrenCount = parsed.body.children.length;
    let pCount = parsed.$('p').length;
    let imgCount = parsed.$('img').length;

    if (post.data.status === 'published' && childrenCount <= 1 && pCount <= 1 && imgCount === 0) {
        post.data.status = 'draft';
        post.data.tags.push({
            url: 'migrator-added-medium-possible-comment',
            data: {
                name: '#Medium Possible Comment',
                slug: 'hash-medium-possible-comment'
            }
        });
    }

    // Medium usually has an hr divider at the very beginning of the content
    // We don't need this so remove it if we find it
    let firstSection = parsed.$('.section--first')[0];
    if (firstSection) {
        let firstChild = firstSection.firstElementChild;
        if (firstChild && firstChild.classList.contains('section-divider')) {
            firstChild.remove();
        }
    }

    // Sometimes Medium has a duplicate header at the beginning of the content
    // Don't need this either so remove it
    let firstTitle = parsed.$('h1, h2, h3, h4, blockquote')[0];
    if (firstTitle && equivalentTitles(firstTitle.textContent, post.data.title)) {
        firstTitle.remove();
    }

    // Remove the subtitle if it's the same as the excerpt
    parsed.$('.graf--subtitle').forEach((el) => {
        if (equivalentTitles(el.textContent, post.data.custom_excerpt)) {
            el.remove();
        }
    });

    // Convert galleries
    parsed.$('.section-inner.sectionLayout--outsetRow').forEach((el) => {
        // Check we're only working with a group of <figure> elements
        const children = Array.from(el.children);
        const allFigures = children.every(child => child.tagName.toLowerCase() === 'figure');

        // If it's all figures
        if (allFigures) {
            let figcaption = el.querySelector('figcaption');
            let caption = figcaption ? domUtils.serializeChildren(figcaption).trim() : null;

            let cardOpts = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    images: [],
                    caption: caption
                }
            };

            el.querySelectorAll('figure').forEach((figure) => { // eslint-disable-line no-shadow
                let img = figure.querySelector('img');
                cardOpts.payload.images.push({
                    row: 0,
                    fileName: img.getAttribute('data-image-id'),
                    src: img.getAttribute('src'),
                    width: img.getAttribute('data-width'),
                    height: img.getAttribute('data-height')
                });
            });

            const galleryHtml = serializer.serialize(galleryCard.render(cardOpts));

            domUtils.replaceWith(el, galleryHtml);
        }
    });

    // Convert Medium bookmarks
    parsed.$('.graf--mixtapeEmbed').forEach((el) => {
        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {}
        };

        let href = el.querySelector('.markup--anchor')?.getAttribute('href');
        cardOpts.payload.url = href;

        cardOpts.payload.metadata = {
            url: href,
            title: el.querySelector('.markup--strong')?.textContent || '',
            description: el.querySelector('.markup--em')?.textContent || ''
        };

        const mixtapeImage = el.querySelector('.js-mixtapeImage');
        const bngImage = mixtapeImage ? mixtapeImage.style.backgroundImage : null;
        if (bngImage) {
            let src = bngImage.replace(/url\(["']?(.*?)["']?\)/, (m, p) => p);
            cardOpts.payload.metadata.thumbnail = src;
        }

        const bookmarkHtml = serializer.serialize(bookmarkCard.render(cardOpts));

        domUtils.replaceWith(el, `<!--kg-card-begin: html-->\n${bookmarkHtml}\n<!--kg-card-end: html-->`);
    });

    // Handle blockquotes made of 2 elements
    parsed.$('blockquote.graf--pullquote, blockquote.graf--blockquote').forEach((bq) => {
        bq.removeAttribute('name');
        bq.removeAttribute('id');
        bq.removeAttribute('class');

        bq.querySelectorAll('a').forEach((a) => {
            a.removeAttribute('data-href');
            a.removeAttribute('class');
        });

        let textElements = [];
        textElements.push(domUtils.serializeChildren(bq).trim());

        const nextElem = bq.nextElementSibling;
        if (nextElem && nextElem.matches('.graf-after--pullquote')) {
            const nextText = domUtils.serializeChildren(nextElem);
            if (nextText && nextText.length > 0) {
                textElements.push(nextText.trim());
                nextElem.remove();
            }
        }

        domUtils.replaceWith(bq, `<blockquote><p>${textElements.join('<br><br>')}</p></blockquote>`);
    });

    parsed.$('pre.graf--pre').forEach((pre) => {
        pre.removeAttribute('name');
        pre.removeAttribute('id');
        pre.removeAttribute('class');
        pre.removeAttribute('data-code-block-mode');
        pre.removeAttribute('spellcheck');
        pre.innerHTML = domUtils.serializeChildren(pre).trim();

        const lang = pre.getAttribute('data-code-block-lang');
        pre.removeAttribute('data-code-block-lang');

        pre.querySelectorAll('span.pre--content').forEach((span) => {
            const code = parsed.document.createElement('code');
            code.innerHTML = span.innerHTML;
            span.parentNode.replaceChild(code, span);
        });

        pre.querySelectorAll('code').forEach((code) => {
            code.removeAttribute('name');
            code.removeAttribute('id');
            code.removeAttribute('class');

            if (lang && lang.length > 0) {
                code.classList.add(`language-${lang}`);
            }

            code.innerHTML = domUtils.serializeChildren(code).replace(/<br>/g, ' \n').trim();
        });
    });

    post.data.html = parsed.html().trim();

    return post;
};
