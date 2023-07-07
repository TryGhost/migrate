export class ImportError extends Error {
    constructor({message, cause}: {message: string, cause?: Error}) {
        super(message);
        this.cause = cause;
    }

    toString() {
        const base = this.message;

        if (this.cause) {
            return `${base}\n  ${this.cause.toString()}`;
        }
        return base;
    }
}
