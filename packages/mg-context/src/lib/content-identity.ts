import {createHash} from 'node:crypto';
import errors from '@tryghost/errors';

export type JsonValue = string | number | boolean | null | JsonValue[] | {[key: string]: JsonValue};

/** The identity of the raw source staged in a persistent migration. */
export interface ContentIdentity {
    /** A stable name for the source export or collection. */
    source: string;
    /** A revision or digest that changes when source content changes. */
    revision: string;
    /** Options that affect source selection or raw content, excluding mapping settings. */
    options?: {[key: string]: JsonValue};
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return JSON.stringify(value);
    }
    if (typeof value !== 'object') {
        throw new errors.BadRequestError({message: 'Content identity options must contain only JSON values.'});
    }
    if (ancestors.has(value)) {
        throw new errors.BadRequestError({message: 'Content identity options cannot contain cycles.'});
    }

    ancestors.add(value);
    let result: string;
    if (Array.isArray(value)) {
        const items: string[] = [];
        for (let index = 0; index < value.length; index += 1) {
            if (!Object.hasOwn(value, index)) {
                throw new errors.BadRequestError({message: 'Content identity options cannot contain sparse arrays.'});
            }
            items.push(canonicalJson(value[index], ancestors));
        }
        result = `[${items.join(',')}]`;
    } else if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
        // Object.keys() returns a fresh array; sorting it cannot mutate caller data.
        // oxlint-disable-next-line unicorn/no-array-sort
        const fields = Object.keys(value).sort();
        result = `{${fields.map(key => `${JSON.stringify(key)}:${canonicalJson((value as any)[key], ancestors)}`).join(',')}}`;
    } else {
        throw new errors.BadRequestError({message: 'Content identity options must contain only plain JSON objects.'});
    }
    ancestors.delete(value);
    return result;
}

export function fingerprintContentIdentity(identity: ContentIdentity): string {
    for (const field of Object.keys(identity ?? {})) {
        if (!['source', 'revision', 'options'].includes(field)) {
            throw new errors.BadRequestError({message: `Unknown content identity field: ${field}.`});
        }
    }
    for (const field of ['source', 'revision'] as const) {
        if (typeof identity?.[field] !== 'string' || !identity[field].trim()) {
            throw new errors.BadRequestError({message: `Content identity requires a non-empty ${field}.`});
        }
    }
    if (
        identity.options !== undefined &&
        (identity.options === null ||
            Array.isArray(identity.options) ||
            typeof identity.options !== 'object' ||
            (Object.getPrototypeOf(identity.options) !== Object.prototype &&
                Object.getPrototypeOf(identity.options) !== null))
    ) {
        throw new errors.BadRequestError({message: 'Content identity options must be a plain JSON object.'});
    }

    const value = canonicalJson({
        version: 2,
        source: identity.source,
        revision: identity.revision,
        options: identity.options ?? {}
    });
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
