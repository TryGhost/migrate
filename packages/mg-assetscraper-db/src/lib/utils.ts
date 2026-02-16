/* c8 ignore start */
import sharp from 'sharp';
import convert from 'heic-convert';
import {fileTypeFromBuffer} from 'file-type';
import transliterate from 'transliteration';

// Taken from https://github.com/TryGhost/Ghost/blob/main/ghost/core/core/shared/config/overrides.json
export const knownImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp', 'image/avif', 'image/heif', 'image/heic'];
export const knownMediaTypes = ['video/mp4', 'video/webm', 'video/ogg', 'audio/mpeg', 'audio/vnd.wav', 'audio/wave', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
export const knownFileTypes = ['application/pdf', 'application/json', 'application/ld+json', 'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.text', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/rtf', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml', 'application/atom+xml'
];
export const knownTypes = [...knownImageTypes, ...knownMediaTypes, ...knownFileTypes];

export const needsConverting = ['image/avif', 'image/heif', 'image/heic'];

/**
 * Convert HEIC/HEIF/AVIF images to supported formats (JPEG or WebP)
 * @param buffer - The image buffer to convert
 * @param fileMime - The mime type of the image
 * @returns Object with converted buffer, extension, and mime type
 */
export async function convertImageBuffer(buffer: Buffer, fileMime: string): Promise<{buffer: Buffer, extension: string, mime: string}> {
    let convertedBuffer: Buffer;

    if (fileMime === 'image/heic' || fileMime === 'image/heif') {
        convertedBuffer = Buffer.from(await convert({
            buffer: buffer,
            format: 'JPEG'
        }));
    } else {
        convertedBuffer = await sharp(buffer).webp({lossless: true}).toBuffer();
    }

    const newFileInfo = await fileTypeFromBuffer(convertedBuffer);
    if (!newFileInfo) {
        throw new Error('Could not determine file type after conversion');
    }

    return {
        buffer: convertedBuffer,
        extension: newFileInfo.ext,
        mime: newFileInfo.mime
    };
}

/**
 * Determine the storage folder based on mime type
 * @param fileMime - The mime type of the file
 * @returns The folder name ('images', 'media', 'files') or null if unknown
 */
export function getFolderForMimeType(fileMime: string): 'images' | 'media' | 'files' | null {
    if (knownImageTypes.includes(fileMime)) {
        return 'images';
    } else if (knownMediaTypes.includes(fileMime)) {
        return 'media';
    } else if (knownFileTypes.includes(fileMime)) {
        return 'files';
    }
    return null;
}

/**
 * Sanitize a path segment by replacing problematic characters with dashes
 * @param str - The string to sanitize
 * @returns The sanitized string
 */
export function sanitizePathSegment(str: string): string {
    return str.replace(/\./g, '-').replace(/,/g, '-').replace(/:/g, '-').replace(/[^a-zA-Z0-9_-]/g, '-');
}

/**
 * Decode, transliterate and sanitize a single path segment
 * @param segment - A path segment or encoded path segment
 * @returns The normalized segment
 */
export function normalizePathSegment(segment: string): string {
    let decodedSegment = segment;
    try {
        decodedSegment = decodeURIComponent(segment);
    } catch {
        decodedSegment = segment;
    }

    decodedSegment = decodedSegment.trim();
    if (!decodedSegment) {
        return '';
    }

    const hasNonAscii = Array.from(decodedSegment).some(char => char.charCodeAt(0) > 127);
    const transliteratedSegment = transliterate.slugify(decodedSegment, {
        separator: hasNonAscii ? '_' : '-'
    });
    const segmentSource = hasNonAscii ? transliteratedSegment : decodedSegment;
    let normalizedSegment = sanitizePathSegment(segmentSource).replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Keep protocol-like markers (e.g. "https:") distinct in nested encoded paths.
    if (decodedSegment.endsWith(':') && !normalizedSegment.endsWith('-')) {
        normalizedSegment = `${normalizedSegment}-`;
    }

    return normalizedSegment;
}
