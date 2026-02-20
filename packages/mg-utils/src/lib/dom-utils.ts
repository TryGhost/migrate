/* eslint-disable ghost/filenames/match-exported-class */
import {JSDOM} from 'jsdom';

// HTML5 void elements that should be self-closing
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

export interface ParsedFragment {
    document: Document;
    body: HTMLElement;
    $(selector: string, context?: Element): Element[];
    html(): string;
    text(): string;
}

/**
 * Parse HTML fragment without document wrapper
 */
export function parseFragment(html: string | null): ParsedFragment {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${html || ''}</body></html>`);
    const document = dom.window.document;
    const body = document.body;

    return {
        document,
        body,
        $(selector: string, context: Element = body): Element[] {
            return Array.from(context.querySelectorAll(selector));
        },
        html(): string {
            return serializeChildren(body);
        },
        text(): string {
            /* c8 ignore next -- defensive fallback for null textContent */
            return body.textContent || '';
        }
    };
}

/**
 * Escape HTML attribute value
 */
function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Serialize an element to HTML5-compliant string
 * Handles void elements (self-closing) and non-void elements correctly
 */
export function serializeNode(node: Node | null): string {
    if (!node) {
        return '';
    }

    // Text node
    if (node.nodeType === 3) {
        /* c8 ignore next -- defensive fallback for null textContent */
        return node.textContent || '';
    }

    // Comment node
    if (node.nodeType === 8) {
        /* c8 ignore next -- defensive fallback for null comment data */
        return `<!--${(node as Comment).data || ''}-->`;
    }

    // Element node
    if (node.nodeType === 1) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        let attrs = '';

        for (const attribute of element.attributes) {
            if (attribute.value === '') {
                attrs += ` ${attribute.name}`;
            } else {
                attrs += ` ${attribute.name}="${escapeAttr(attribute.value)}"`;
            }
        }

        // Void elements - self-closing
        if (VOID_ELEMENTS.has(tagName)) {
            return `<${tagName}${attrs}>`;
        }

        // Non-void elements - always have closing tag
        const children = serializeChildren(element);
        return `<${tagName}${attrs}>${children}</${tagName}>`;
    }

    // Document fragment
    if (node.nodeType === 11) {
        return serializeChildren(node);
    }

    return '';
}

/**
 * Serialize children of a node
 */
export function serializeChildren(node: Node | null): string {
    if (!node) {
        return '';
    }
    let html = '';
    for (const child of node.childNodes) {
        html += serializeNode(child);
    }
    return html;
}

/**
 * Replace an element with new HTML content
 */
export function replaceWith(el: Element | null, content: string | Node): void {
    if (!el || !el.parentNode) {
        return;
    }

    if (typeof content === 'string') {
        const temp = el.ownerDocument.createElement('template');
        temp.innerHTML = content;
        const fragment = el.ownerDocument.createDocumentFragment();
        while (temp.content.firstChild) {
            fragment.appendChild(temp.content.firstChild);
        }
        el.parentNode.replaceChild(fragment, el);
    } else if (content && content.nodeType) {
        el.parentNode.replaceChild(content, el);
    }
}

/**
 * Insert content before an element
 */
export function insertBefore(el: Element | null, content: string | Node): void {
    if (!el || !el.parentNode) {
        return;
    }

    if (typeof content === 'string') {
        const temp = el.ownerDocument.createElement('template');
        temp.innerHTML = content;
        const fragment = el.ownerDocument.createDocumentFragment();
        while (temp.content.firstChild) {
            fragment.appendChild(temp.content.firstChild);
        }
        el.parentNode.insertBefore(fragment, el);
    } else if (content && content.nodeType) {
        el.parentNode.insertBefore(content, el);
    }
}

/**
 * Insert content after an element
 */
export function insertAfter(el: Element | null, content: string | Node): void {
    if (!el || !el.parentNode) {
        return;
    }

    if (typeof content === 'string') {
        const temp = el.ownerDocument.createElement('template');
        temp.innerHTML = content;
        const fragment = el.ownerDocument.createDocumentFragment();
        while (temp.content.firstChild) {
            fragment.appendChild(temp.content.firstChild);
        }
        el.parentNode.insertBefore(fragment, el.nextSibling);
    } else if (content && content.nodeType) {
        el.parentNode.insertBefore(content, el.nextSibling);
    }
}

/**
 * Wrap an element with a wrapper element
 */
export function wrap(el: Element | null, wrapper: string | Element): Element | null {
    if (!el || !el.parentNode) {
        return null;
    }

    let wrapperEl: Element | null;
    if (typeof wrapper === 'string') {
        const temp = el.ownerDocument.createElement('template');
        temp.innerHTML = wrapper;
        wrapperEl = temp.content.firstElementChild;
    } else {
        wrapperEl = wrapper;
    }

    if (!wrapperEl) {
        return null;
    }

    el.parentNode.insertBefore(wrapperEl, el);
    wrapperEl.appendChild(el);
    return wrapperEl;
}

/**
 * Create an element with optional attributes
 */
export function createElement(document: Document, tagName: string, attrs: Record<string, string> = {}): Element {
    const el = document.createElement(tagName);
    for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
    }
    return el;
}

/**
 * Get or set attribute value (returns empty string if not found, like Cheerio)
 */
export function attr(el: Element | null, name: string, value?: string): string | undefined {
    if (!el) {
        return '';
    }
    if (value !== undefined) {
        el.setAttribute(name, value);
        return;
    }
    return el.getAttribute(name) || '';
}

/**
 * Check if element matches selector
 */
export function is(el: Element | null, selector: string): boolean {
    if (!el || typeof el.matches !== 'function') {
        return false;
    }
    return el.matches(selector);
}

/**
 * Get all parent elements matching selector
 */
export function parents(el: Element | null, selector?: string): Element[] {
    const result: Element[] = [];
    let current = el ? el.parentElement : null;

    while (current) {
        if (!selector || current.matches(selector)) {
            result.push(current);
        }
        current = current.parentElement;
    }

    return result;
}

/**
 * Get the last (furthest) parent matching selector
 */
export function lastParent(el: Element | null, selector: string): Element | null {
    const allParents = parents(el, selector);
    return allParents.length > 0 ? allParents[allParents.length - 1] : null;
}

/**
 * Set CSS style property on element
 */
export function setStyle(el: HTMLElement | null, property: string, value: string): void {
    if (!el || !el.style) {
        return;
    }
    el.style.setProperty(property, value);
}

/**
 * Check if a node is a comment node
 */
export function isComment(node: Node | null | undefined): boolean {
    return node !== null && node !== undefined && node.nodeType === 8;
}

/**
 * Get comment node data
 */
export function getCommentData(node: Node | null): string {
    if (isComment(node)) {
        return (node as Comment).data || '';
    }
    return '';
}
