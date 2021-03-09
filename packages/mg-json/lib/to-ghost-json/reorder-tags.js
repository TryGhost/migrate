module.exports = (json) => {
    json.posts.forEach((post) => {
        let tags = post.data.tags || [];
        let publicTags = [];
        let internalTags = [];

        tags.forEach((tag) => {
            if (tag.data.name.includes('#')) {
                internalTags.push(tag);
            } else {
                publicTags.push(tag);
            }
        });

        post.data.tags = [...publicTags, ...internalTags];
    });

    return json;
};
