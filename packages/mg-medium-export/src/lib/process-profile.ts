import {domUtils} from '@tryghost/mg-utils';
import type {MediumRelation} from './types.js';

const {processFragment} = domUtils;

// Keys we've seen so far
// Profile
// Display name
// Email address
// Medium user ID
// Created at
// Twitter
// Twitter account ID
// Facebook display name
// Facebook account ID
// Google email
// Google display name
// Google account ID

const mediumToGhost: Record<string, string> = {
    'email address': 'email',
    'created at': 'created_at',
    image: 'profile_image',
    twitter: 'twitter'
};

/** Read the export owner from a Medium export's `profile/profile.html`. */
export default ({html}: {html: string}): MediumRelation => {
    return processFragment(html, parsed => {
        const profile: MediumRelation = {
            url: parsed.$('.u-url')[0]?.getAttribute('href') ?? undefined,
            data: {
                name: parsed.$('.p-name')[0]?.textContent || '',
                profile_image: parsed.$('.u-photo')[0]?.getAttribute('src') ?? undefined,
                roles: ['Contributor']
            }
        };

        parsed.$('ul li').forEach(el => {
            const [item, value] = el.textContent!.split(': ');
            const key = mediumToGhost[item.toLowerCase()] || null;

            if (key) {
                profile.data[key] = value;
            }
        });

        return profile;
    });
};
