export default (json) => {
    json.posts.forEach((item, index) => {
        let input = item.data;

        // String length data from https://github.com/TryGhost/Ghost/blob/main/core/server/data/schema/schema.js
        // @TODO: log some sort of warning for things like this?

        if (input.custom_excerpt && input.custom_excerpt.length > 300) {
            input.custom_excerpt = input.custom_excerpt.substring(0, 300);
        }

        if (input.og_title && input.og_title.length > 300) {
            input.og_title = input.og_title.substring(0, 300);
        }

        if (input.og_description && input.og_description.length > 500) {
            input.og_description = input.og_description.substring(0, 500);
        }

        if (input.twitter_title && input.twitter_title.length > 300) {
            input.twitter_title = input.twitter_title.substring(0, 300);
        }

        if (input.twitter_description && input.twitter_description.length > 500) {
            input.twitter_description = input.twitter_description.substring(0, 500);
        }

        if (input.meta_title && input.meta_title.length > 300) {
            input.meta_title = input.meta_title.substring(0, 300);
        }

        if (input.meta_description && input.meta_description.length > 500) {
            input.meta_description = input.meta_description.substring(0, 500);
        }

        if (input.email_subject && input.email_subject.length > 300) {
            input.email_subject = input.email_subject.substring(0, 300);
        }

        if (input.feature_image_alt && input.feature_image_alt.length > 125) {
            input.feature_image_alt = input.feature_image_alt.substring(0, 125);
        }

        json.posts[index].data = input;
    });

    return json;
};
