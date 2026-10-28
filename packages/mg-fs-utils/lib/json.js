import {createReadStream} from 'node:fs';
import {StringDecoder} from 'node:string_decoder';

// A byte order mark between tokens is skipped like whitespace.
const WHITESPACE = new Set([' ', '\t', '\n', '\r', '﻿']);
const PRIMITIVE_END = new Set([',', ']', '}', ' ', '\t', '\n', '\r']);
const CLOSER = {'{': '}', '[': ']'};

/** Pulls decoded text from a stream and scans JSON values out of it, holding only the text not yet consumed. */
class Scanner {
    #chunks;
    #decoder = new StringDecoder('utf8');
    // Characters dropped from the front of `text`, so errors can give positions in the whole input.
    #dropped = 0;
    text = '';
    pos = 0;

    constructor(source) {
        this.#chunks = source[Symbol.asyncIterator]();
    }

    /** Append the next chunk to `text`. False once the input has ended. */
    async #fill() {
        const {value, done} = await this.#chunks.next();
        if (done) {
            return false;
        }
        this.text += typeof value === 'string' ? value : this.#decoder.write(value);
        return true;
    }

    /** Drop the first `count` characters of `text`, which have been consumed. */
    #drop(count) {
        this.text = this.text.slice(count);
        this.pos -= count;
        this.#dropped += count;
    }

    error(message) {
        return new SyntaxError(`${message} at position ${this.#dropped + this.pos}`);
    }

    unexpected(found) {
        return this.error(found === null ? 'Unexpected end of JSON' : `Unexpected '${found}'`);
    }

    /** Skip whitespace and return the next character without consuming it, or null at the end of the input. */
    async peek() {
        for (;;) {
            while (this.pos < this.text.length) {
                if (!WHITESPACE.has(this.text[this.pos])) {
                    return this.text[this.pos];
                }
                this.pos += 1;
            }
            this.#drop(this.pos);
            if (!(await this.#fill())) {
                return null;
            }
        }
    }

    /** Consume `char`, which must be the next non-whitespace character. */
    async expect(char) {
        const found = await this.peek();
        if (found !== char) {
            throw this.unexpected(found);
        }
        this.pos += 1;
    }

    /**
     * Consume the value starting at the next non-whitespace character. Returns its text when `keep` is true;
     * otherwise the value is skipped without being held in memory. Strings, objects and arrays are scanned for their
     * end, so their contents are checked when the caller parses the text; numbers, booleans and null are checked here.
     */
    async value(keep) {
        const first = await this.peek();
        if (first === null || first === ',' || first === ']' || first === '}') {
            throw this.unexpected(first);
        }
        let start = this.pos;
        let i = this.pos;
        // Keep the value's text (or drop what has been scanned, when skipping) and read more input.
        const refill = async retain => {
            this.pos = i;
            this.#drop(retain ? start : i);
            i = this.pos;
            start = 0;
            return this.#fill();
        };

        if (first !== '{' && first !== '[' && first !== '"') {
            // A number, true, false or null runs to the next delimiter or the end of the input. Its text is short, and
            // is always kept so it can be checked whole.
            for (;;) {
                if (i === this.text.length) {
                    if (!(await refill(true))) {
                        break;
                    }
                } else if (PRIMITIVE_END.has(this.text[i])) {
                    break;
                } else {
                    i += 1;
                }
            }
            const token = this.text.slice(start, i);
            try {
                JSON.parse(token);
            } catch {
                this.pos = start;
                throw this.error(`Invalid JSON value '${token}'`);
            }
            this.pos = i;
            return keep ? token : undefined;
        }

        const closers = [];
        let inString = false;
        let escaped = false;
        for (;;) {
            if (i === this.text.length) {
                if (!(await refill(keep))) {
                    throw this.unexpected(null);
                }
                continue;
            }
            const char = this.text[i];
            i += 1;
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === '"') {
                    inString = false;
                    if (!closers.length) {
                        break;
                    }
                }
            } else if (char === '"') {
                inString = true;
            } else if (char === '{' || char === '[') {
                closers.push(CLOSER[char]);
            } else if (char === '}' || char === ']') {
                if (closers.pop() !== char) {
                    this.pos = i - 1;
                    throw this.unexpected(char);
                }
                if (!closers.length) {
                    break;
                }
            }
        }
        this.pos = i;
        return keep ? this.text.slice(start, i) : undefined;
    }
}

const where = (path, depth) => (depth ? `"${path.slice(0, depth).join('.')}"` : 'the top level');

/** Yield the items of the array reached by following `path` from the current value. */
async function* arrayAt(scanner, path, depth) {
    const found = await scanner.peek();
    if (depth < path.length) {
        if (found !== '{') {
            throw scanner.error(`Expected an object at ${where(path, depth)}`);
        }
        scanner.pos += 1;
        let matched = false;
        let next = await scanner.peek();
        while (next !== '}') {
            if (next !== '"') {
                throw scanner.unexpected(next);
            }
            const key = JSON.parse(await scanner.value(true));
            await scanner.expect(':');
            if (!matched && key === path[depth]) {
                matched = true;
                yield* arrayAt(scanner, path, depth + 1);
            } else {
                await scanner.value(false);
            }
            next = await scanner.peek();
            if (next === ',') {
                scanner.pos += 1;
                next = await scanner.peek();
                if (next === '}') {
                    throw scanner.unexpected(next);
                }
            } else if (next !== '}') {
                throw scanner.unexpected(next);
            }
        }
        scanner.pos += 1;
        if (!matched) {
            throw scanner.error(`No "${path[depth]}" key in the object at ${where(path, depth)}`);
        }
        return;
    }

    if (found !== '[') {
        throw scanner.error(`Expected an array at ${where(path, depth)}`);
    }
    scanner.pos += 1;
    if ((await scanner.peek()) === ']') {
        scanner.pos += 1;
        return;
    }
    for (let index = 0, next = ','; next === ','; index += 1) {
        const text = await scanner.value(true);
        let item;
        try {
            item = JSON.parse(text);
        } catch (error) {
            throw new SyntaxError(
                `Invalid JSON in item ${index} of the array at ${where(path, depth)}: ${error.message}`,
                {
                    cause: error
                }
            );
        }
        yield item;
        next = await scanner.peek();
        if (next !== ',' && next !== ']') {
            throw scanner.unexpected(next);
        }
        scanner.pos += 1;
    }
}

/**
 * Read the items of one array in a JSON file or readable stream, one at a time, so a large export is never held in
 * memory as a whole. Only the item being read is kept; each is parsed with `JSON.parse()`.
 *
 * `path` names the keys that lead from the top-level value to the array: `[]` (the default) reads a top-level array,
 * and `['data', 'authors']` reads the array at `data.authors`. Other values are skipped without being held. The rest of
 * the input is still read after the array, so malformed JSON anywhere in it rejects. The input is destroyed when the
 * caller stops early or reading fails.
 *
 * @param {String|import('node:stream').Readable} input - path to a JSON file, or a readable stream of JSON text
 * @param {Object} [options]
 * @param {String[]} [options.path] - keys leading to the array; defaults to the top-level value
 * @returns {AsyncGenerator<any>}
 */
async function* streamArray(input, {path = []} = {}) {
    const source = typeof input === 'string' ? createReadStream(input) : input;
    try {
        const scanner = new Scanner(source);
        yield* arrayAt(scanner, path, 0);
        const rest = await scanner.peek();
        if (rest !== null) {
            throw scanner.unexpected(rest);
        }
    } finally {
        source.destroy();
    }
}

export default {
    streamArray
};
