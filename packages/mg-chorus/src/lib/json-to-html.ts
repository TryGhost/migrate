import type {ChorusComponent} from './types.js';

type Block = ChorusComponent;

const EntryBodyList = (block: Block): string => {
    const tag = block.ordered ? 'ol' : 'ul';
    const items = block.items.map((item: any) => `<li>${item.line.html}</li>`).join('');
    return `<${tag}>${items}</${tag}>`;
};

const EntryBodyParagraph = (block: Block): string => `<p>${block.contents.html}</p>`;

const EntryBodyEmbed = (block: Block): string =>
    `<!--kg-card-begin: html-->${block.embed.embedHtml}<!--kg-card-end: html-->`;

const EntryBodyHeading = (block: Block): string => {
    // Remove bold tags from headings, leaving italics alone
    const contents = block.contents.html.replace(/<\/?(?:strong|b)>/g, '');
    return `<h${block.level}>${contents}</h${block.level}>`;
};

const EntryBodyHTML = (block: Block): string => `<!--kg-card-begin: html-->${block.rawHtml}<!--kg-card-end: html-->`;

const EntryBodyPoll = (block: Block): string => {
    const html = [];
    if (block.poll.title) {
        html.push(`<h3>${block.poll.title}</h3>`);
    }
    html.push('<!--kg-card-begin: html-->', '<table>', '<tbody>');
    for (const row of block.poll.options) {
        html.push(`<tr><td>${row.label}</td><td>${row.votes}</td></tr>`);
    }
    html.push('</tbody>', '</table>', '<!--kg-card-end: html-->');
    return html.join('');
};

const EntryBodyPullquote = (block: Block): string =>
    `<blockquote class="kg-blockquote-alt">${block.quote.html}</blockquote>`;

const EntryBodyTable = (block: Block): string => {
    const html = [];
    if (block.table.title) {
        html.push(`<h3>${block.table.title}</h3>`);
    }
    html.push('<!--kg-card-begin: html-->', '<table>', '<thead>');
    for (const column of block.table.columns) {
        html.push(`<th>${column}</th>`);
    }
    html.push('</thead>', '<tbody>');
    for (const row of block.table.rows) {
        html.push(`<tr>${row.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`);
    }
    html.push('</tbody>', '</table>', '<!--kg-card-end: html-->');
    return html.join('');
};

const EntryBodyBlockquote = (block: Block): string => {
    const paragraphs = block.paragraphs.map((paragraph: any) => `<p>${paragraph.contents.html}</p>`).join('');
    return `<blockquote>${paragraphs}</blockquote>`;
};

const EntryBodyHorizontalRule = (): string => '<hr>';

const EntryBodyRelatedList = (block: Block): string => {
    const links = block.items.map((item: any) => `<a href="${item.url}">${item.title}</a>`).join('<br>');
    return `<hr><h4>Related</h4><p>${links}</p><hr>`;
};

const converters: Record<string, (block: Block) => string> = {
    EntryBodyParagraph,
    EntryBodyEmbed,
    EntryBodyList,
    EntryBodyHeading,
    EntryBodyHTML,
    EntryBodyPoll,
    EntryBodyPullquote,
    EntryBodyTable,
    EntryBodyBlockquote,
    EntryBodyHorizontalRule,
    EntryBodyRelatedList
};

/**
 * Convert a Chorus entry's body components to HTML. Images, galleries, sidebars and unknown block types are left
 * out.
 */
const jsonToHtml = (blocks: Block[] | null | undefined): string =>
    (blocks ?? [])
        .map(block => (Object.hasOwn(converters, String(block.__typename)) ? converters[block.__typename!](block) : ''))
        .join('');

export default jsonToHtml;

export {
    EntryBodyList,
    EntryBodyParagraph,
    EntryBodyEmbed,
    EntryBodyHeading,
    EntryBodyHTML,
    EntryBodyPoll,
    EntryBodyPullquote,
    EntryBodyTable,
    EntryBodyBlockquote,
    EntryBodyHorizontalRule,
    EntryBodyRelatedList
};
