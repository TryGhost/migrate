const EntryBodyList = (block) => {
    let html = [];
    html.push((block.ordered) ? '<ol>' : '<ul>');
    block.items.forEach((item) => {
        html.push(`<li>${item.line.html}</li>`);
    });
    html.push((block.ordered) ? '</ol>' : '/<ul>');
    return html.join('');
};

const EntryBodyParagraph = (block) => {
    let html = [];
    html.push(`<p>${block.contents.html}</p>`);
    return html.join('');
};

const EntryBodyEmbed = (block) => {
    let html = [];
    html.push(`<!--kg-card-begin: html-->${block.embed.embedHtml}<!--kg-card-end: html-->`);
    return html.join('');
};

const EntryBodyHeading = (block) => {
    let html = [];

    html.push(`<h${block.level}>`);
    html.push(block.contents.html.replace(/<strong>|<\/strong>|<b>|<\/b>/, '')); // Remove bold tags form header, leave italics alone
    html.push(`</h${block.level}>`);

    return html.join('');
};

const EntryBodyHTML = (block) => {
    let html = [];
    html.push(`<!--kg-card-begin: html-->${block.rawHtml}<!--kg-card-end: html-->`);
    return html.join('');
};

const EntryBodyPoll = (block) => {
    let html = [];
    if (block?.poll?.title) {
        html.push(`<h3>${block.poll.title}</h3>`);
    }
    html.push(`<!--kg-card-begin: html-->`);
    html.push('<table>');
    html.push('<tbody>');
    block.poll.options.forEach((row) => {
        html.push(`<tr>`);
        html.push(`<td>${row.label}</td>`);
        html.push(`<td>${row.votes}</td>`);
        html.push(`</tr>`);
    });
    html.push('</tbody>');
    html.push('</table>');
    html.push(`<!--kg-card-end: html-->`);
    return html.join('');
};

const EntryBodyPullquote = (block) => {
    let html = [];
    html.push(`<blockquote class="kg-blockquote-alt">${block.quote.html}</blockquote>`);
    return html.join('');
};

const EntryBodyTable = (block) => {
    let html = [];
    if (block?.table?.title) {
        html.push(`<h3>${block.table.title}</h3>`);
    }
    html.push(`<!--kg-card-begin: html-->`);
    html.push('<table>');
    html.push('<thead>');
    block.table.columns.forEach((col) => {
        html.push(`<th>${col}</th>`);
    });
    html.push('</thead>');
    html.push('<tbody>');
    block.table.rows.forEach((row) => {
        html.push(`<tr>`);
        row.forEach((cell) => {
            html.push(`<td>${cell}</td>`);
        });
        html.push(`</tr>`);
    });
    html.push('</tbody>');
    html.push('</table>');
    html.push(`<!--kg-card-end: html-->`);
    return html.join('');
};

const EntryBodyBlockquote = (block) => {
    let html = [];
    html.push('<blockuote>');
    block.paragraphs.forEach((paragraph) => {
        html.push(`<p>${paragraph.contents.html}</p>`);
    });
    html.push('</blockuote>');
    return html.join('');
};

const EntryBodyHorizontalRule = () => {
    let html = [];
    html.push('<hr>');
    return html.join('');
};

const EntryBodyRelatedList = (block) => {
    let html = [];
    html.push('<hr>');
    html.push('<h4>Related</h4>');
    html.push('<p>');
    block.items.forEach((item, indexIndex) => {
        html.push(`${indexIndex !== 0 ? '<br>' : ''}<a href="${item.url}">${item.title}</a>`);
    });
    html.push('</p>');
    html.push('<hr>');
    return html.join('');
};

const jsonToHtml = (blocks) => {
    let html = [];

    blocks.forEach((block) => {
        const itemType = block.__typename;

        switch (itemType) {
        case 'EntryBodyParagraph':
            html.push(EntryBodyParagraph(block));
            break;
        case 'EntryBodyEmbed':
            html.push(EntryBodyEmbed(block));
            break;
        case 'EntryBodyList':
            html.push(EntryBodyList(block));
            break;
        case 'EntryBodyHeading':
            html.push(EntryBodyHeading(block));
            break;
        case 'EntryBodyHTML':
            html.push(EntryBodyHTML(block));
            break;
        case 'EntryBodyPoll':
            html.push(EntryBodyPoll(block));
            break;
        case 'EntryBodyPullquote':
            html.push(EntryBodyPullquote(block));
            break;
        case 'EntryBodyTable':
            html.push(EntryBodyTable(block));
            break;
        case 'EntryBodyBlockquote':
            html.push(EntryBodyBlockquote(block));
            break;
        case 'EntryBodyHorizontalRule':
            html.push(EntryBodyHorizontalRule());
            break;
        case 'EntryBodyRelatedList':
            html.push(EntryBodyRelatedList(block));
            break;
        case 'EntryBodySidebar':
        case 'EntryBodyImage':
        case 'EntryBodyGallery':
            // Not used
            break;
        default:
            // console.log(`Unhandled type: ${itemType}`);
        }
    });

    return html.join('');
};

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
