module.exports.processTerms = (ghTags) => {
    let tags = [];

    ghTags.forEach((tag) => {
        tags.push({url: tag.url, data: tag});
    });

    tags.push({
        url: 'migrator-added-tag', data: {name: '#ghost'}
    });

    return tags;
};

module.exports.processPost = (ghPost) => {
    const post = {
        url: ghPost.url,
        data: ghPost
    };

    post.data.authors = this.processAuthors(ghPost.authors);

    if (ghPost.tags && ghPost.tags.length > 0) {
        post.data.tags = this.processTerms(ghPost.tags);
    } else {
        delete post.data.tags;
    }

    return post;
};

module.exports.processPosts = (posts) => {
    return posts.map(post => this.processPost(post));
};

module.exports.processAuthor = (ghAuthor) => {
    let profileImage = ghAuthor.profile_image.replace(/s=96/, 's=3000');
    profileImage = profileImage.replace(/\/\/www.gravatar.com/, 'https://www.gravatar.com');

    let authorData = {
        url: ghAuthor.url,
        data: ghAuthor
    };

    authorData.data.profile_image = profileImage;

    return authorData;
};

module.exports.processAuthors = (authors) => {
    return authors.map(author => this.processAuthor(author));
};

module.exports.all = async ({result: input}) => {
    const output = {};

    output.users = this.processAuthors(input.users);
    output.posts = this.processPosts(input.posts, output.users);

    return output;
};
