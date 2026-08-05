import errors from '@tryghost/errors';
import {getFieldInfo} from './zod-schema-utils.js';
import type {SanitizedField} from './database.js';

const NO_URL_FIELDS: ReadonlySet<string> = new Set();

export default class MigrateBase {
    #context;
    #sanitized: SanitizedField[] = [];
    schema: any;
    data: any;
    dbId: number | null = null;
    ghostId: string | null = null;

    constructor() {
        this.#context = this.constructor.name;
    }

    /**
     * Fields holding a URL. Cutting one to length leaves a link that points nowhere,
     * so an over-long value is dropped instead of truncated. Subclasses override this.
     *
     * A getter rather than a field so it stays off the instance — getFinal() copies
     * every own property.
     */
    protected get urlFields(): ReadonlySet<string> {
        return NO_URL_FIELDS;
    }

    /**
     * Normalize a single value to something Ghost will accept: strip surrounding
     * whitespace, then truncate to the field's maximum length.
     *
     * Applied both when a value is set and again before it is saved, so values
     * that bypass set() — supplied to a constructor, or loaded from a row — are
     * covered too.
     */
    protected sanitizeValue(key: string, value: any): any {
        if (typeof value !== 'string') {
            return value;
        }

        let result = value.trim();

        const info = getFieldInfo(this.schema.shape[key]);
        if (info.maxLength && result.length > info.maxLength) {
            // A truncated URL is a broken link, not a shorter one
            if (this.urlFields.has(key)) {
                return null;
            }

            result = result.slice(0, info.maxLength).trim();

            // A slug cut mid-word can be left with a dangling separator
            if (key === 'slug') {
                result = result.replace(/-+$/, '');
            }
        }

        return result;
    }

    /**
     * Every rule that runs before a save. Subclasses override this to add their own,
     * calling super.applySanitizers() for the shared length and whitespace handling.
     */
    protected applySanitizers() {
        for (const key of Object.keys(this.schema.shape)) {
            if (typeof this.data[key] === 'string') {
                this.data[key] = this.sanitizeValue(key, this.data[key]);
            }
        }
    }

    /**
     * The single enforcement point. Normalizes every field against Ghost's schema and
     * records what changed. Called by each context's save(), before anything is written.
     */
    sanitize(collector?: SanitizedField[]) {
        const before = new Map<string, any>();
        for (const key of Object.keys(this.schema.shape)) {
            before.set(key, this.data[key]);
        }

        this.applySanitizers();

        for (const [key, oldValue] of before) {
            if (this.data[key] !== oldValue) {
                this.#recordSanitized(key, oldValue, this.data[key]);
            }
        }

        if (collector) {
            this.flushSanitized(collector);
        }
    }

    #recordSanitized(field: string, oldValue: any, newValue: any) {
        const info = getFieldInfo(this.schema.shape[field]);

        let reason: SanitizedField['reason'] = 'replaced';
        if (typeof newValue === 'string') {
            if (info.maxLength && oldValue.length > info.maxLength) {
                reason = 'truncated';
            } else if (oldValue.trim() === newValue) {
                reason = 'trimmed';
            }
        }

        this.#sanitized.push({context: this.#context, slug: '', field, reason, oldValue, newValue});
    }

    /**
     * Hand off everything recorded so far. The slug is stamped on here rather than at
     * record time because it may itself have been sanitized in the same pass.
     */
    protected flushSanitized(collector: SanitizedField[]) {
        for (const entry of this.#sanitized) {
            entry.slug = typeof this.data.slug === 'string' ? this.data.slug : '';
            collector.push(entry);
        }
        this.#sanitized = [];
    }

    protected initializeData() {
        for (const key of Object.keys(this.schema.shape)) {
            const info = getFieldInfo(this.schema.shape[key]);
            this.data[key] = info.hasDefault ? info.defaultValue : null;
        }
    }

    validate(key: any, value: any) {
        if (!(key in this.schema.shape) || value === null) {
            return;
        }

        const info = getFieldInfo(this.schema.shape[key]);

        if (info.maxLength && value?.length > info.maxLength) {
            throw new errors.InternalServerError({
                message: `(${this.#context}) Value for "${key}" is too long. Currently ${value.length} characters, Max ${info.maxLength}.`,
                context: value
            });
        } else if (info.type === 'dateTime') {
            if (!(value instanceof Date)) {
                throw new errors.InternalServerError({
                    message: `(${this.#context}) Invalid date value for "${key}"`,
                    context: value
                });
            }
        } else if (info.type === 'string' && info.choices && info.choices.length) {
            if (!info.choices.includes(value)) {
                throw new errors.InternalServerError({
                    message: `(${this.#context}) Invalid choice for "${key}"`,
                    context: value
                });
            }
        } else if (info.type === 'boolean' && typeof value !== 'boolean') {
            throw new errors.InternalServerError({
                message: `(${this.#context}) Invalid boolean value for "${key}"`,
                context: value
            });
        } else if (info.type === 'array') {
            if (!Array.isArray(value)) {
                throw new errors.InternalServerError({
                    message: `(${this.#context}) Invalid array value for "${key}"`,
                    context: value
                });
            }

            for (const item of value) {
                if (info.elementChoices && !info.elementChoices.includes(item)) {
                    throw new errors.InternalServerError({
                        message: `(${this.#context}) Invalid choice for "${key}"`,
                        context: item
                    });
                }
            }
        }

        // Run Zod refinements (e.g. .refine() on schema fields)
        const result = this.schema.shape[key].safeParse(value);
        if (!result.success) {
            const customIssue = result.error.issues.find((i: any) => i.code === 'custom');
            if (customIssue) {
                throw new errors.InternalServerError({
                    message: `(${this.#context}) ${customIssue.message} for "${key}"`,
                    context: value
                });
            }
        }
    }

    #setProp(prop: any, value: any) {
        if (prop in this.schema.shape) {
            // NOTE: This is buggy
            // if (Array.isArray(value)) {
            //     value.forEach((vItem) => {
            //         this.validate(prop, vItem);
            //     });
            // } else {
            //     this.validate(prop, value);
            // }

            const sanitized = this.sanitizeValue(prop, value);
            if (sanitized !== value) {
                this.#recordSanitized(prop, value, sanitized);
            }

            this.validate(prop, sanitized);

            this.data[prop] = sanitized;
        } else {
            throw new errors.InternalServerError({
                message: `(${this.#context}) Property "${prop}" is not allowed in ${this.#context}`
            });
        }
    }

    get(prop: string) {
        if (prop in this.schema.shape) {
            let value = this.data[prop];
            return value;
        } else {
            throw new errors.InternalServerError({
                message: `(${this.#context}) Property "${prop}" does not exist in ${this.#context}`
            });
        }
    }

    set(prop: string, value: any) {
        if (Array.isArray(prop)) {
            prop.forEach(item => {
                this.#setProp(item, value);
            });
        } else {
            this.#setProp(prop, value);
        }

        return this;
    }

    remove(prop: any) {
        const info = getFieldInfo(this.schema.shape[prop]);
        this.set(prop, info.hasDefault ? info.defaultValue : null);

        return this;
    }

    get getFinal(): any {
        this.checkRequired(this.data);
        let clone: any = Object.assign({}, this);
        delete clone.schema;
        delete clone.dbId;
        delete clone.ghostId;
        if (this.ghostId) {
            clone.data = {id: this.ghostId, ...clone.data};
        }
        return clone;
    }

    checkRequired(working: any) {
        // Check required fields
        const required = Object.keys(this.schema.shape).filter(key => {
            const info = getFieldInfo(this.schema.shape[key]);
            return info.required;
        });

        required.forEach(key => {
            if (working[key] === null || working[key] === undefined) {
                throw new errors.InternalServerError({message: `(${this.#context}) Missing required field: "${key}"`});
            }
        });

        // Validate values
        for (const [key, value] of Object.entries(working)) {
            this.validate(key, value);
        }

        return true;
    }
}
