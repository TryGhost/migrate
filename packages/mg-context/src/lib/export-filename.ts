import errors from '@tryghost/errors';

export function exportBaseFilename(rawFilename: string, extension: 'json' | 'csv' = 'json'): string {
    const filename = rawFilename.replace(new RegExp(`\\.${extension}$`, 'i'), '');
    if (!filename || filename.includes('/') || filename.includes('\\')) {
        throw new errors.BadRequestError({
            message: `Ghost ${extension.toUpperCase()} filename must be a non-empty base filename without path separators.`
        });
    }
    return filename;
}
