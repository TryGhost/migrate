import {join} from 'node:path';
import cheerio from 'cheerio';

const processTextItem = (item, ctx, content) => {
    let itemHtmlChunks = [];

    if (item.image_original_filename) {
        const imagePath = join('/', ctx.fileCache.imagePath, `${content.number}`, item.image_original_filename);

        if (item.url) {
            itemHtmlChunks.push(`<!--kg-card-begin: html--><a class="kg-card kg-image-card" href="${item.url}"><img class="kg-image" src="${imagePath}" alt="${item.title}" /></a><!--kg-card-end: html-->`);
        } else {
            itemHtmlChunks.push(`<img src="${imagePath}" alt="${item.title}" />`);
        }
    }

    itemHtmlChunks.push(`<h3>${item.title}</h3>`);
    itemHtmlChunks.push(item.description);

    const $ = cheerio.load(item.footer);
    itemHtmlChunks.push(`<p><i>${$.text()}</i></p>`);

    return itemHtmlChunks.join('');
};

const processLinkItem = (item, ctx, content) => {
    let itemHtmlChunks = [];

    if (item.image_original_filename) {
        const imagePath = join('/', ctx.fileCache.imagePath, `${content.number}`, item.image_original_filename);

        if (item.url) {
            itemHtmlChunks.push(`<!--kg-card-begin: html--><a class="kg-card kg-image-card" href="${item.url}"><img class="kg-image" src="${imagePath}" alt="${item.title}" /></a><!--kg-card-end: html-->`);
        } else {
            itemHtmlChunks.push(`<img src="${imagePath}" alt="${item.title}" />`);
        }
    }

    itemHtmlChunks.push(`<h3><a href="${item.url}">${item.title}</a></h3>`);
    itemHtmlChunks.push(item.description);
    itemHtmlChunks.push(`<p><i><a href="${item.url}">${item.url_domain}</a></i></p>`);

    return itemHtmlChunks.join('');
};

export default (content, ctx) => {
    let htmlChunks = [];

    content.categories.forEach((element) => {
        htmlChunks.push(`<h2>${element.name}</h2>`);

        element.items.forEach((item, i) => {
            if (i) {
                htmlChunks.push('<hr>');
            }

            if (item.type === 'Text') {
                htmlChunks.push(processTextItem(item, ctx, content));
            } else if (item.type === 'Link') {
                htmlChunks.push(processLinkItem(item, ctx, content));
            }
        });
    });

    return htmlChunks.join('');
};
