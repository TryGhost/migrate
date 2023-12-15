export default (json, ctx = null) => {
    json.posts.forEach((item, index) => {
        let input = item.data;

        // String length data from https://github.com/TryGhost/Ghost/blob/main/ghost/core/core/server/data/schema/schema.js
        let properties = {
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

                if (ctx && ctx.logger) {
                    ctx.logger.warn({message: `${propKey} for slug "${item.data.slug}" is too long.\nOriginal: "${input[propKey]}"\nTruncated to: "${truncated}"`});
                }

                input[propKey] = truncated;
            }
        }

        json.posts[index].data = input;
    });

    return json;
};
