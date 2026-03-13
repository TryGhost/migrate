import {domUtils} from '@tryghost/mg-utils';

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

const mediumToGhost = {
    'email address': 'email',
    'created at': 'created_at',
    image: 'profile_image',
    twitter: 'twitter'
};

export default ({html}) => {
    const parsed = domUtils.parseFragment(html);
    let profile = {
        url: parsed.$('.u-url')[0]?.getAttribute('href'),
        data: {
            name: parsed.$('.p-name')[0]?.textContent || '',
            profile_image: parsed.$('.u-photo')[0]?.getAttribute('src'),
            roles: [
                'Contributor'
            ]
        }
    };

    parsed.$('ul li').forEach((el) => {
        let [item, value] = el.textContent.split(': ');
        let key = mediumToGhost[item.toLowerCase()] || null;

        if (key) {
            profile.data[key] = value;
        }
    });

    return profile;
};
