import errors from '@tryghost/errors';

export type JsonValue = string | number | boolean | null | JsonValue[] | {[key: string]: JsonValue};
export type JsonObject = {[key: string]: JsonValue};

/** Validate without silently dropping undefined, non-finite numbers, or class instances. */
export function serializeMetadata(value: JsonObject = {}): string {
    const ancestors = new Set<object>();
    function validate(item: unknown): void {
        if (item === null || typeof item === 'string' || typeof item === 'boolean') {
            return;
        }
        if (typeof item === 'number' && Number.isFinite(item)) {
            return;
        }
        if (typeof item !== 'object' || ancestors.has(item)) {
            throw new errors.BadRequestError({message: 'Metadata must contain finite, acyclic JSON values.'});
        }
        ancestors.add(item);
        if (Array.isArray(item)) {
            for (let index = 0; index < item.length; index += 1) {
                if (!Object.hasOwn(item, index)) {
                    throw new errors.BadRequestError({message: 'Metadata cannot contain sparse arrays.'});
                }
                validate(item[index]);
            }
        } else {
            if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
                throw new errors.BadRequestError({message: 'Metadata must contain plain JSON objects.'});
            }
            for (const child of Object.values(item)) {
                validate(child);
            }
        }
        ancestors.delete(item);
    }
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
        throw new errors.BadRequestError({message: 'Metadata must be a JSON object.'});
    }
    validate(value);
    return JSON.stringify(value);
}
