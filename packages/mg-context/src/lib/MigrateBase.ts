import errors from '@tryghost/errors';
import {getFieldInfo} from './zod-schema-utils.js';

export default class MigrateBase {
    #context;
    schema: any;
    data: any;
    dbId: number | null = null;
    ghostId: string | null = null;

    constructor() {
        this.#context = this.constructor.name;
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
        } else if (info.type === 'array' && !Array.isArray(value)) {
            throw new errors.InternalServerError({
                message: `(${this.#context}) Invalid array value for "${key}"`,
                context: value
            });
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

            this.validate(prop, value);

            this.data[prop] = value;
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
            prop.forEach((item) => {
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
        const required = Object.keys(this.schema.shape).filter((key) => {
            const info = getFieldInfo(this.schema.shape[key]);
            return info.required;
        });

        required.forEach((key) => {
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
