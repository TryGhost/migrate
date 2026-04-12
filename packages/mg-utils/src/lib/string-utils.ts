import {join} from 'node:path';

const htmlUnescapeMap: Record<string, string> = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\''};
const htmlUnescapeRegex = /&(?:amp|lt|gt|quot|#39);/g;

/**
 * Unescape HTML entities (&amp; &lt; &gt; &quot; &#39;) back to literal characters.
 */
export const unescapeHTML = (str: string): string => str.replace(htmlUnescapeRegex, match => htmlUnescapeMap[match]);

/**
 * Convert a slug or hyphenated string to title case.
 * 'hello-world' → 'Hello World'
 */
export const startCase = (str: string): string => str.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/**
 * Convert a string to kebab-case.
 * 'Hello World' → 'hello-world'
 */
export const kebabCase = (str: string): string => str.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();

/**
 * Strip HTML tags and normalize whitespace.
 * '<p>Hello <b>world</b></p>' → 'Hello world'
 */
export const stripHtml = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').trim();

/**
 * Strip protocol and query parameters from a URL, returning host/path.
 * 'https://example.com/my-post/?ref=home' → 'example.com/my-post/'
 */
export const cleanURL = (url: string): string => {
    try {
        const urlParts = new URL(url);
        return join(urlParts.host, urlParts.pathname);
    } catch {
        return url;
    }
};
