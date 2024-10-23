import errors from '@tryghost/errors';

export default class MigrateBase {
    #context;
    schema: any;
    data: any;

    constructor() {
        this.#context = this.constructor.name;
    }

    validate(key: any, value: any) {
        if (!this.schema[key] || value === null) {
            return;
        }

        const type = this.schema[key].type;
        const maxLength = this.schema[key].maxLength ?? null;
        const choices = this.schema[key].choices ?? null;

        // Use validation method from schema if available
        if (this?.schema[key]?.validate) {
            value = this.schema[key].validate(value);
        }

        if (maxLength && value?.length > maxLength) {
            throw new errors.InternalServerError({
                message: `(${this.#context}) Value for "${key}" is too long. Currently ${value.length} characters, Max ${maxLength}.`,
                context: value
            });
        } else if (type === 'dateTime') {
            if (!(value instanceof Date)) {
                throw new errors.InternalServerError({
                    message: `(${this.#context}) Invalid date value for ${key}`,
                    context: value
                });
            }
        } else if (type === 'string' && choices && choices.length) {
            if (!choices.includes(value)) {
                throw new errors.InternalServerError({
                    message: `(${this.#context}) Invalid choice for ${key}`,
                    context: value
                });
            }
        } else if (type === 'boolean' && typeof value !== 'boolean') {
            throw new errors.InternalServerError({
                message: `(${this.#context}) Invalid boolean value for ${key}`,
                context: value
            });
        } else if (type === 'array' && !Array.isArray(value)) {
            throw new errors.InternalServerError({
                message: `(${this.#context}) Invalid array value for ${key}`,
                context: value
            });
        }
    }

    #setProp(prop: any, value: any) {
        if (this.schema[prop]) {
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
        if (prop in this.schema) {
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
        this.set(prop, this.schema[prop].default ?? null);

        return this;
    }

    get getFinal(): any {
        this.checkRequired(this.data);
        let clone = Object.assign({}, this);
        delete clone.schema;
        return clone;
    }

    checkRequired(working: any) {
        // Check required fields
        const required = Object.keys(this.schema).filter(key => this.schema[key].required);

        required.forEach((key) => {
            if (working[key] === null || working[key] === undefined) {
                throw new errors.InternalServerError({message: `(${this.#context}) Missing required field: ${key}`});
            }
        });

        // Validate values
        for (const [key, value] of Object.entries(working)) {
            this.validate(key, value);
        }

        return true;
    }
}
