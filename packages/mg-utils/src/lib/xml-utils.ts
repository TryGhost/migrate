import {readFile} from 'node:fs/promises';
import {XMLParser, type X2jOptions} from 'fast-xml-parser';

const defaultOptions: Partial<X2jOptions> = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false
};

/**
 * Parse XML string or file into a JavaScript object.
 *
 * If the input starts with `<` (after trimming), it is treated as raw XML.
 * Otherwise it is treated as a file path and read from disk.
 */
export async function parseXml(input: string, options?: Partial<X2jOptions>): Promise<Record<string, unknown>> {
    const trimmed = input.trim();
    const xml = trimmed.startsWith('<') ? trimmed : await readFile(trimmed, 'utf-8');

    const parser = new XMLParser({...defaultOptions, ...options});
    return parser.parse(xml) as Record<string, unknown>;
}

/**
 * The text of a value parsed from XML: a string or number as given, an element's `#text` when it also has attributes,
 * or the text of the first of a repeated element. Missing values and elements without text give `''`.
 */
export function getText(node: unknown): string {
    if (Array.isArray(node)) {
        return getText(node[0]);
    }
    if (node === undefined || node === null) {
        return '';
    }
    if (typeof node === 'object') {
        return getText((node as Record<string, unknown>)['#text']);
    }
    return String(node);
}

/**
 * A value parsed from XML as an array. A repeated element parses as an array and a single one as a value; a missing or
 * empty one gives `[]`.
 */
export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

export {streamXmlRecords} from './stream-xml.js';
export type {XmlRecord} from './stream-xml.js';
