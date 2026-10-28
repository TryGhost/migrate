/**
 * Parse an HTTP or HTTPS URL from source data or an option.
 *
 * Strings are trimmed, and a relative URL is resolved against `base` when one is given. Returns `undefined` for
 * non-strings, blank strings, invalid URLs and URLs with any other protocol, such as `mailto:` or `javascript:`.
 */
export const httpUrl = (value: unknown, base?: string): URL | undefined => {
    const text = typeof value === 'string' ? value.trim() : '';
    const url = text ? URL.parse(text, base || undefined) : null;
    return url && ['http:', 'https:'].includes(url.protocol) ? url : undefined;
};

/**
 * A URL or path without trailing slashes, such as `https://example.com/blog` for `https://example.com/blog//`.
 *
 * It scans from the end rather than using `/\/+$/`, which backtracks quadratically on long runs of slashes.
 */
export const trimTrailingSlashes = (value: string): string => {
    let end = value.length;
    while (end > 0 && value[end - 1] === '/') {
        end -= 1;
    }
    return value.slice(0, end);
};

/**
 * The lowercased host and path of a site's URL, without trailing slashes, such as `example.com/blog`.
 *
 * It identifies one site regardless of protocol, query or a trailing slash, so it can scope stable IDs to a site and
 * check that several exports come from the same one. A string is parsed with `new URL()`, which throws when it is
 * not a URL.
 */
export const canonicalSite = (url: URL | string): string => {
    const {host, pathname} = typeof url === 'string' ? new URL(url) : url;
    return host.toLowerCase() + trimTrailingSlashes(pathname);
};
