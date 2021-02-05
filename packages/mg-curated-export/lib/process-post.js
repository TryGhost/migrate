const processContent = require('./process-content');

module.exports = (name, json, globalUser, tags, ctx) => {
    const post = {
        data: {}
    };

    let theSlug = json.url.substring(json.url.lastIndexOf('/') + 1, json.url.length);

    post.url = json.url;
    post.data.title = json.title;
    post.data.custom_excerpt = json.summary;
    post.data.slug = theSlug;
    post.data.status = json.publication_status;
    post.data.created_at = json.published_at;
    post.data.published_at = json.published_at;
    post.data.updated_at = json.updated_at;

    // Process content
    post.data.html = processContent(name, json, post, ctx);

    // Set author data here
    post.data.author = globalUser;

    // Set the tags
    post.data.tags = tags;

    return post;
};
