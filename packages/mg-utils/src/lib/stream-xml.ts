import {createReadStream} from 'node:fs';
import {StringDecoder} from 'node:string_decoder';
import {SaxesParser} from 'saxes';

export interface XmlRecord {
    path: string;
    value: any;
    line: number;
    column: number;
}

interface Frame {
    name: string;
    data: Record<string, any>;
    text: string;
}

/** Select complete subtrees without buffering their containing document. */
export async function* streamXmlRecords(
    input: string | AsyncIterable<string | Uint8Array>,
    {paths, filename = typeof input === 'string' ? input : '<stream>'}: {paths: string[]; filename?: string}
): AsyncGenerator<XmlRecord> {
    const parser = new SaxesParser();
    const selected = new Set(paths);
    const path: string[] = [];
    const frames: Frame[] = [];
    let location = {line: 0, column: 0};
    let ready: XmlRecord | undefined;
    const decoder = new StringDecoder('utf8');
    parser.on('opentag', tag => {
        path.push(tag.name);
        if (frames.length || selected.has(path.join('/')) || selected.has(path.slice(0, -1).join('/') + '/*')) {
            if (!frames.length) {
                location = {line: parser.line, column: parser.column};
            }
            frames.push({
                name: tag.name,
                data: Object.fromEntries(Object.entries(tag.attributes).map(([key, value]) => [`@_${key}`, value])),
                text: ''
            });
        }
    });
    const text = (value: string) => {
        if (frames.length) {
            frames[frames.length - 1].text += value;
        }
    };
    parser.on('text', text);
    parser.on('cdata', text);
    parser.on('closetag', () => {
        if (frames.length) {
            const frame = frames.pop()!;
            const value = Object.keys(frame.data).length
                ? {...frame.data, ...(frame.text ? {'#text': frame.text} : {})}
                : frame.text;
            if (frames.length) {
                const parent = frames[frames.length - 1].data;
                const existing = Object.hasOwn(parent, frame.name) ? parent[frame.name] : undefined;
                if (Array.isArray(existing)) {
                    existing.push(value);
                } else {
                    Object.defineProperty(parent, frame.name, {
                        enumerable: true,
                        configurable: true,
                        writable: true,
                        value: existing === undefined ? value : [existing, value]
                    });
                }
            } else {
                ready = {path: path.join('/'), value, ...location};
            }
        }
        path.pop();
    });
    const source = typeof input === 'string' ? createReadStream(input) : input;
    const feed = (part: string) => {
        try {
            parser.write(part);
        } catch (cause) {
            throw new Error(`${filename}:${parser.line}:${parser.column}: ${(cause as Error).message}`, {cause});
        }
    };
    for await (const chunk of source) {
        const decoded = typeof chunk === 'string' ? chunk : decoder.write(Buffer.from(chunk));
        // A closing bracket can complete at most one selected subtree.
        let start = 0;
        for (let end = decoded.indexOf('>'); end !== -1; end = decoded.indexOf('>', start)) {
            feed(decoded.slice(start, end + 1));
            start = end + 1;
            if (ready) {
                yield ready;
                ready = undefined;
            }
        }
        feed(decoded.slice(start));
    }
    feed(decoder.end());
    try {
        parser.close();
    } catch (cause) {
        throw new Error(`${filename}:${parser.line}:${parser.column}: ${(cause as Error).message}`, {cause});
    }
}
