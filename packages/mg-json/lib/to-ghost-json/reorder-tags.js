export default (json) => {
    json.posts.forEach((post) => {
        let tags = post.data.tags || [];
        let publicTags = [];
        let internalTags = [];

        // Filter out empty tags
        tags = tags.filter(tag => tag.data.name.length);

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
