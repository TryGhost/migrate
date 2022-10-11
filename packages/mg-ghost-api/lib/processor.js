const processTags = (ghTags) => {
    let tags = [];

    ghTags.forEach((tag) => {
        // If the tag is internal (which typically comes from another Ghost site), it's URL value is a 404 page
        // The tools merge tags with the same slug, so this means multiple tags with the same URL don't get merged
        // TODO: Find out where tags with the same URL are being 'merged'
        if (tag.visibility === 'internal') {
            tag.url = `#${tag.slug}`;
        }
        tags.push({url: tag.url, data: tag});
    });

    tags.push({
        url: 'migrator-added-tag', data: {
            name: '#ghost',
            slug: 'hash-ghost',
            description: 'Posts migrated from an existing Ghost installation',
            visibility: 'internal'
        }
    });

    return tags;
};

const processPost = (ghPost) => {
    const post = {
        url: ghPost.url,
        data: ghPost
    };

    post.data.authors = processAuthors(ghPost.authors);

    if (ghPost.tags && ghPost.tags.length > 0) {
        post.data.tags = processTags(ghPost.tags);
    } else {
        delete post.data.tags;
    }

    return post;
};

const processPosts = (posts) => {
    return posts.map(post => processPost(post));
};

const processAuthor = (ghAuthor) => {
    let authorData = {
        url: ghAuthor.url,
        data: ghAuthor
    };

    if (ghAuthor.profile_image) {
        let profileImage = ghAuthor.profile_image.replace(/s=([0-9]{1,4})/, 's=3000');
        profileImage = profileImage.replace(/\/\/www.gravatar.com/, 'https://www.gravatar.com');
        authorData.data.profile_image = profileImage;
    }

    return authorData;
};

const processAuthors = (authors) => {
    return authors.map(author => processAuthor(author));
};

const all = async ({result: input}) => {
    const output = {};

    output.users = processAuthors(input.users);
    output.posts = processPosts(input.posts, output.users);

    return output;
};

export default {
    processTags,
    processPost,
    processPosts,
    processAuthor,
    processAuthors,
    all
};
