module.exports = (json) => {
    json.posts.forEach((item, index) => {
        let input = item.data;

        // @TODO: log some sort of warning for things like this?

        if (input.custom_excerpt && input.custom_excerpt.length > 300) {
            input.custom_excerpt = input.custom_excerpt.substring(0, 300);
        }

        if (input.meta_description && input.meta_description.length > 500) {
            input.meta_description = input.meta_description.substring(0, 500);
        }

        if (input.feature_image_alt && input.feature_image_alt.length > 125) {
            input.feature_image_alt = input.feature_image_alt.substring(0, 125);
        }

        json.posts[index].data = input;
    });

    return json;
};
