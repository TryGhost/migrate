export class ImportError extends Error {
    filePath: string;
    line: number;

    constructor({message, filePath, line, cause}: {message: string, filePath: string, line: number, cause?: Error}) {
        super(message);
        this.filePath = filePath;
        this.line = line;
        this.cause = cause;
    }

    toString() {
        const base = this.message + ` at ${this.filePath}:${this.line}`;

        if (this.cause) {
            return `${base}\n  ${this.cause.toString()}`;
        }
        return base;
    }
}
