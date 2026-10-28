/** `YYYY-MM-DD HH:MM[:SS[.fff]]`, or with a `T` separator, and no zone designator. */
const zonelessTimestamp = /^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d(?::\d\d(?:\.\d+)?)?)$/;

/**
 * Parse a date from source data.
 *
 * A timestamp without a zone designator, such as WordPress's `2025-07-27 03:37:40` or `2025-07-27T03:37:40`, is
 * read as UTC rather than in the machine's local timezone. Anything else is parsed as given: ISO 8601 with `Z` or an
 * offset, RFC 2822 such as `Sun, 27 Jul 2025 03:37:40 +0000` or `… GMT`, or a date-only `2025-07-27`.
 *
 * Returns `undefined` for non-strings, blank strings and invalid dates, including WordPress's zeroed
 * `0000-00-00 00:00:00`.
 */
export const parseDate = (value: unknown): Date | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const text = value.trim();
    const zoneless = text.match(zonelessTimestamp);
    const date = new Date(zoneless ? `${zoneless[1]}T${zoneless[2]}Z` : text);
    return Number.isFinite(date.getTime()) ? date : undefined;
};
