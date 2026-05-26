import SimpleDom from 'simple-dom';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';
import {wixMediaIdToUrl} from './wix-image.js';

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

type WixNode = {
    type?: string;
    nodes?: WixNode[];
    textData?: {
        text?: string;
        decorations?: Array<{
            type?: string;
            linkData?: {
                link?: {
                    url?: string;
                    target?: string;
                    rel?: {
                        noreferrer?: boolean;
                    };
                };
            };
        }>;
    };
    headingData?: {
        level?: number;
    };
    imageData?: {
        image?: {
            src?: {
                id?: string;
            };
            width?: number;
            height?: number;
        };
        altText?: string;
    };
    buttonData?: {
        text?: string;
        link?: {
            url?: string;
        };
        containerData?: {
            alignment?: string;
        };
    };
};

const escapeHtml = (value: string) => {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const htmlCard = (html: string) => {
    return [
        '<!--kg-card-begin: html-->',
        '<div class="mg-html-card">',
        html,
        '</div>',
        '<!--kg-card-end: html-->'
    ].join('\n');
};

const sanitizeHref = (value?: string) => {
    if (!value) {
        return null;
    }

    const trimmedValue = value.trim();

    try {
        const url = new URL(trimmedValue);

        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
            return null;
        }

        return trimmedValue;
    } catch (error) {
        return null;
    }
};

const paragraphsFromPlainText = (plainText?: string) => {
    return (plainText || '')
        .split(/\n{2,}/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
        .join('\n');
};

const renderChildren = (node: WixNode) => {
    return (node.nodes || []).map(renderNode).join('');
};

const renderText = (node: WixNode, options: {stripBold?: boolean} = {}) => {
    const rawText = node.textData?.text || '';
    const decorations = node.textData?.decorations || [];
    const textParts = rawText.match(/^(\s*)(.*?)(\s*)$/s);
    const leadingWhitespace = textParts?.[1] || '';
    const linkText = textParts?.[2] || '';
    const trailingWhitespace = textParts?.[3] || '';
    let text = escapeHtml(linkText);
    const linkUrl = sanitizeHref(decorations.find(decoration => decoration.type === 'LINK')?.linkData?.link?.url);

    for (const decoration of decorations) {
        if (decoration.type === 'BOLD' && !options.stripBold) {
            text = `<strong>${text}</strong>`;
        } else if (decoration.type === 'ITALIC') {
            text = `<em>${text}</em>`;
        } else if (decoration.type === 'UNDERLINE') {
            text = `<u>${text}</u>`;
        } else if (decoration.type === 'SUPERSCRIPT') {
            text = `<sup>${text}</sup>`;
        }
    }

    if (linkUrl && linkText.length > 0) {
        text = `<a href="${escapeHtml(linkUrl)}">${text}</a>`;
    }

    return `${escapeHtml(leadingWhitespace)}${text}${escapeHtml(trailingWhitespace)}`;
};

const renderHeadingChildren = (node: WixNode): string => {
    return (node.nodes || []).map((child) => {
        if (child.type === 'TEXT') {
            return renderText(child, {stripBold: true});
        }

        return renderNode(child);
    }).join('');
};

const renderImage = (node: WixNode) => {
    const image = node.imageData?.image;
    const src = wixMediaIdToUrl({
        id: image?.src?.id,
        width: image?.width,
        height: image?.height
    });

    if (!src) {
        return htmlCard(`<pre>${escapeHtml(JSON.stringify(node, null, 2))}</pre>`);
    }

    const cardOpts = {
        env: {dom: new SimpleDom.Document()},
        payload: {
            src,
            alt: node.imageData?.altText || null
        }
    };

    return serializer.serialize(imageCard.render(cardOpts));
};

const renderButton = (node: WixNode) => {
    const text = escapeHtml(node.buttonData?.text || '');
    const url = sanitizeHref(node.buttonData?.link?.url);
    const alignment = (node.buttonData?.containerData?.alignment || 'CENTER').toLowerCase();
    const alignmentClass = ['left', 'center', 'right'].includes(alignment) ? `kg-align-${alignment}` : 'kg-align-center';

    if (!text) {
        return '';
    }

    if (!url) {
        return `<p>${text}</p>`;
    }

    return `<div class="kg-card kg-button-card ${alignmentClass}"><a href="${escapeHtml(url)}" class="kg-btn kg-btn-accent">${text}</a></div>`;
};

const renderTableCell = (node: WixNode) => {
    return `<td>${renderChildren(node)}</td>`;
};

const renderTableRow = (node: WixNode) => {
    return `<tr>${renderChildren(node)}</tr>`;
};

const renderTable = (node: WixNode) => {
    return `<table><tbody>${renderChildren(node)}</tbody></table>`;
};

const renderListItem = (node: WixNode) => {
    return `<li>${renderChildren(node)}</li>`;
};

const renderUnknownNode = (node: WixNode) => {
    if (node.nodes && node.nodes.length > 0) {
        return htmlCard(renderChildren(node));
    }

    return htmlCard(`<pre>${escapeHtml(JSON.stringify(node, null, 2))}</pre>`);
};

const renderNode = (node: WixNode): string => {
    switch (node.type) {
    case 'TEXT':
        return renderText(node);
    case 'PARAGRAPH': {
        const children = renderChildren(node);

        if (children.trim().length === 0) {
            return '';
        }

        return `<p>${children}</p>`;
    }
    case 'HEADING': {
        const level = Math.min(Math.max(node.headingData?.level || 2, 1), 6);
        return `<h${level}>${renderHeadingChildren(node)}</h${level}>`;
    }
    case 'BULLETED_LIST':
        return `<ul>${renderChildren(node)}</ul>`;
    case 'ORDERED_LIST':
        return `<ol>${renderChildren(node)}</ol>`;
    case 'LIST_ITEM':
        return renderListItem(node);
    case 'DIVIDER':
        return '<hr>';
    case 'IMAGE':
        return renderImage(node);
    case 'BUTTON':
        return renderButton(node);
    case 'TABLE':
        return renderTable(node);
    case 'TABLE_ROW':
        return renderTableRow(node);
    case 'TABLE_CELL':
        return renderTableCell(node);
    default:
        return renderUnknownNode(node);
    }
};

const richContentToHtml = ({richContent, plainContent}: {richContent?: string, plainContent?: string}) => {
    if (!richContent || richContent.trim().length === 0) {
        return htmlCard(paragraphsFromPlainText(plainContent));
    }

    try {
        const parsed = JSON.parse(richContent);
        const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];

        if (nodes.length === 0) {
            return htmlCard(paragraphsFromPlainText(plainContent));
        }

        return nodes.map(renderNode).join('');
    } catch (error) {
        return htmlCard(paragraphsFromPlainText(plainContent));
    }
};

export {
    escapeHtml,
    htmlCard,
    paragraphsFromPlainText,
    renderNode,
    richContentToHtml,
    sanitizeHref
};
