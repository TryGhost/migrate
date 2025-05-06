import {slugify} from '@tryghost/string';
import emailValidator from 'node-email-verifier';

export default async (json) => {
    if (!json.posts) {
        return json;
    }

    json.posts.forEach((item, index) => {
        let input = item.data;

        // String length data from https://github.com/TryGhost/Ghost/blob/main/ghost/core/core/server/data/schema/schema.js
        let properties = {
            title: 255,
            slug: 191,
            custom_excerpt: 300,
            og_title: 300,
            og_description: 500,
            twitter_title: 300,
            twitter_description: 500,
            meta_title: 300,
            meta_description: 500,
            email_subject: 300,
            feature_image_alt: 125
        };

        for (const [propKey, propValue] of Object.entries(properties)) {
            if (input[propKey] && input[propKey].length > propValue) {
                let truncated = input[propKey].substring(0, propValue).trim();

                // eslint-disable-next-line no-console
                console.warn(`${propKey} for slug "${item.data.slug}" is too long.\nOriginal: "${input[propKey]}"\nTruncated to: "${truncated}"`);

                input[propKey] = truncated;
            }
        }

        json.posts[index].data = input;
    });

    if (json?.users?.length) {
        for await (const [index, item] of json.users.entries()) {
            let isEmailValid = false;

            try {
                isEmailValid = await emailValidator(item.data.email);
            } catch (error) {
                // Silently fail here as we don't want to break the migration
                // Just fall back to the <user-slug>@example.com
            }

            if (!isEmailValid) {
                item.data.email = `${slugify(item?.data?.slug || item?.data?.name || 'author')}@example.com`;
            }

            json.users[index] = item;
        }
    }

    return json;
};
