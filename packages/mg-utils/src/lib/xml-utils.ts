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
