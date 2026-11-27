import {readFile} from 'node:fs/promises';
import {slugify} from '@tryghost/string';
import {xmlUtils} from '@tryghost/mg-utils';
import type {LegacyAuthor} from './types.js';

const {parseXml, getText, ensureArray} = xmlUtils;

/** Co-Authors Plus guest author profiles, keyed by their `cap-` slug. */
export type GuestAuthors = Map<string, LegacyAuthor>;

const isURL = (value: string): boolean => {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
};

/**
 * Read Co-Authors Plus guest authors from a WordPress XML export that contains the `guest-author` posts. Each is keyed
 * by its post name — the `cap-` slug that posts carry in their `author` taxonomy terms — and takes its name from the
 * post title. Its `_thumbnail_id` becomes the profile image when that attachment is in the same export.
 */
export async function parseGuestAuthors(xml: string): Promise<GuestAuthors> {
    const parsed = (await parseXml(xml)) as any;
    const items: any[] = ensureArray(parsed?.rss?.channel?.item);

    const attachments = new Map<string, string>();
    for (const item of items) {
        if (getText(item['wp:post_type']) === 'attachment') {
            attachments.set(getText(item['wp:post_id']).trim(), getText(item['wp:attachment_url']).trim());
        }
    }

    const guestAuthors: GuestAuthors = new Map();
    for (const item of items) {
        const key = getText(item['wp:post_name']).trim();
        if (getText(item['wp:post_type']) !== 'guest-author' || !key) {
            continue;
        }

        const meta = new Map<string, string>(
            ensureArray<any>(item['wp:postmeta']).map(entry => [
                getText(entry['wp:meta_key']),
                getText(entry['wp:meta_value']).trim()
            ])
        );
        const login = meta.get('cap-user_login') || key.replace(/^cap-/, '');
        const slug = slugify(login);
        const name = getText(item.title).trim() || meta.get('cap-display_name') || login;

        const data: Record<string, any> = {slug, name};
        const email = meta.get('cap-user_email');
        if (email) {
            data.email = email;
        }
        const bio = meta.get('cap-description');
        if (bio) {
            data.bio = bio;
        }
        const website = meta.get('cap-website');
        if (website && isURL(website)) {
            data.website = website;
        }
        const image = attachments.get(meta.get('_thumbnail_id') ?? '');
        if (image) {
            data.profile_image = image;
        }

        guestAuthors.set(key, {data});
    }

    return guestAuthors;
}

/** Read a guest authors export from disk. See {@link parseGuestAuthors}. */
export async function readGuestAuthors(path: string): Promise<GuestAuthors> {
    return parseGuestAuthors(await readFile(path, 'utf8'));
}
