declare module 'omit-empty' {
    function omitEmpty(obj: any): any;
    export default omitEmpty;
}

declare module '@tryghost/errors' {
    class InternalServerError extends Error {
        constructor(options: {message: string; context?: any});
        errorType: string;
        [key: string]: any;
    }
    class ValidationError extends Error {
        constructor(options: {message: string; context?: any});
        [key: string]: any;
    }
    const _default: {
        InternalServerError: typeof InternalServerError;
        ValidationError: typeof ValidationError;
    };
    export default _default;
}

declare module '@tryghost/string' {
    export function slugify(input: string): string;
}
