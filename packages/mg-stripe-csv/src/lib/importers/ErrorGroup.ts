import {ImportError} from './ImportError.js';

const MAX_PRINTED_ERRORS = 5;

export class ErrorGroup extends Error {
    errors: Error[];

    constructor(errors: Error[] = []) {
        super('ErrorGroup');
        this.errors = errors;
    }

    add(error: Error) {
        this.errors.push(error);
    }

    throwIfNotEmpty() {
        if (!this.isEmpty && this.isFatal) {
            throw this;
        }
    }

    toString() {
        if (this.errors.length === 1) {
            return this.errors[0].toString();
        }

        if (!this.isFatal) {
            return 'Multiple importing warnings: \n' + this.errors.slice(0, MAX_PRINTED_ERRORS).map(e => e.toString()).join('\n\n') + (this.errors.length > MAX_PRINTED_ERRORS ? '\n\n and ' + (this.errors.length - 1) + ' more' : '');
        }

        return 'Multiple importing errors: \n' + this.errors.slice(0, MAX_PRINTED_ERRORS).map(e => e.toString()).join('\n\n') + (this.errors.length > MAX_PRINTED_ERRORS ? '\n\n and ' + (this.errors.length - 1) + ' more' : '');
    }

    get isEmpty() {
        return this.length === 0;
    }

    get isFatal() {
        return this.errors.some(e => !(e instanceof ImportError) || e.isFatal);
    }

    get length() {
        return this.errors.length;
    }
}
