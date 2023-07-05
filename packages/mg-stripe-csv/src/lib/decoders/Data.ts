import {DecodeError} from "./DecodeError.js";

export class Data {
    data: any;

    /**
     * Path to indicate where in the data the error occurred.
     */
    path: string[] = []

    constructor(data: any, path: string[] = []) {
        this.data = data;
        this.path = path;
    }

    get string(): string {
        // Check key is a string
        if (typeof this.data !== 'string') {
            throw new DecodeError(`Expected string, got ${typeof this.data}`, this);
        }

        return this.data;
    }

    get integer(): number {
        try {
            const stringValue = this.string;
            const numberValue = parseInt(stringValue);

            if (isNaN(numberValue)) {
                throw new DecodeError(`Expected integer, got ${stringValue}`, this);
            }
            return numberValue;
        } catch (e) {
            if (e instanceof DecodeError && e.message.startsWith('Expected string')) {
                throw new DecodeError(`Expected integer, got ${this.data}`, this);
            }
            throw e;
        }
    }

    get float(): number {
        try {
            const stringValue = this.string;
            const numberValue = parseFloat(stringValue);

            if (isNaN(numberValue)) {
                throw new DecodeError(`Expected float, got ${stringValue}`, this);
            }
            return numberValue;
        } catch (e) {
            if (e instanceof DecodeError && e.message.startsWith('Expected string')) {
                throw new DecodeError(`Expected float, got ${this.data}`, this);
            }
            throw e;
        }
    }

    enum<T>(values: T[]): T {
        const stringValue = this.string;
        if (!values.includes(stringValue as T)) {
            throw new DecodeError(`Expected one of ${values.join(', ')}, got ${stringValue}`, this);
        }
        return stringValue as T;
    }

    get date(): Date {
        const stringValue = this.string;
        if (stringValue.length !== 16) {
            throw new DecodeError(`Expected date in format YYYY-MM-DD HH:MM, got ${stringValue}`, this);
        }

        const year = stringValue.substring(0, 4);
        const month = stringValue.substring(5, 7);
        const day = stringValue.substring(8, 10);
        const hour = stringValue.substring(11, 13);
        const minute = stringValue.substring(14, 16);

        // Create date from 2023-06-24 23:21 format, always in UTC
        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);

        if (isNaN(date.getTime()) || date.getUTCFullYear() !== parseInt(year) || date.getUTCMonth() !== parseInt(month) - 1 || date.getUTCDate() !== parseInt(day) || date.getUTCHours() !== parseInt(hour) || date.getUTCMinutes() !== parseInt(minute)) {
            throw new DecodeError(`Invalid date ${stringValue}`, this);
        }
        return date;
    }

    get nullable(): Data|null {
        if (this.data === null || this.data === '' || this.data === undefined) {
            return null;
        }
        return this;
    }

    field(key: string): Data {
        if (typeof this.data !== 'object' || this.data === null) {
            throw new DecodeError(`Expected object, got ${typeof this.data}`, this);
        }

        // Check key exists
        if (!(key in this.data)) {
            throw new DecodeError(`Missing column ${key}`, this);
        }

        return new Data(this.data[key], [...this.path, key]);
    }

    optionalField(key: string): Data|undefined {
        if (typeof this.data !== 'object' || this.data === null) {
            throw new DecodeError(`Expected object, got ${typeof this.data}`, this);
        }

        // Check key exists
        if (!(key in this.data)) {
            return undefined;
        }

        return new Data(this.data[key], [...this.path, key]);
    }
}
