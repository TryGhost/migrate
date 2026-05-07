export interface GhostTag {
    slug: string;
    name?: string;
    url?: string;
    description?: string | null;
    visibility?: string;
}

export interface GhostAuthor {
    slug?: string;
    name?: string;
    email?: string;
    url?: string;
    profile_image?: string;
    [key: string]: unknown;
}

export interface GhostPost {
    url: string;
    authors?: GhostAuthor[];
    tags?: GhostTag[];
    tiers?: unknown;
    post_revisions?: unknown;
    count?: unknown;
    primary_author?: unknown;
    primary_tag?: unknown;
    [key: string]: unknown;
}

export interface ProcessedTag {
    url: string;
    data: GhostTag;
}

export interface ProcessedAuthor {
    url: string;
    data: GhostAuthor;
}

export interface ProcessedPostData {
    [key: string]: unknown;
    authors: ProcessedAuthor[];
    tags?: ProcessedTag[];
}

export interface ProcessedPost {
    url: string;
    data: ProcessedPostData;
}

export interface ProcessAllInput {
    result: {
        posts: GhostPost[];
        users: GhostAuthor[];
    };
}

export interface ProcessAllOutput {
    users: ProcessedAuthor[];
    posts: ProcessedPost[];
}

const processTags = (ghTags: GhostTag[]): ProcessedTag[] => {
    const tags: ProcessedTag[] = [];

    ghTags.forEach((tag) => {
        // If the tag is internal (which typically comes from another Ghost site), it's URL value is a 404 page
        // The tools merge tags with the same slug, so this means multiple tags with the same URL don't get merged
        // TODO: Find out where tags with the same URL are being 'merged'
        if (tag.visibility === 'internal') {
            tag.url = `#${tag.slug}`;
        }
        tags.push({url: tag.url ?? '', data: tag});
    });

    tags.push({
        url: 'migrator-added-tag',
        data: {
            name: '#ghost',
            slug: 'hash-ghost',
            description: 'Posts migrated from an existing Ghost installation',
            visibility: 'internal'
        }
    });

    return tags;
};

const processAuthor = (ghAuthor: GhostAuthor): ProcessedAuthor => {
    const authorData: ProcessedAuthor = {
        url: ghAuthor.url ?? '',
        data: ghAuthor
    };

    if (ghAuthor.profile_image) {
        let profileImage = ghAuthor.profile_image.replace(/s=([0-9]{1,4})/, 's=3000');
        profileImage = profileImage.replace(/\/\/www.gravatar.com/, 'https://www.gravatar.com');
        authorData.data.profile_image = profileImage;
    }

    return authorData;
};

const processAuthors = (authors: GhostAuthor[]): ProcessedAuthor[] => {
    return authors.map(author => processAuthor(author));
};

const processPost = (ghPost: GhostPost): ProcessedPost => {
    const data: ProcessedPostData = {
        ...ghPost,
        authors: processAuthors(ghPost.authors ?? []),
        tags: undefined
    };

    if (ghPost.tags && ghPost.tags.length > 0) {
        data.tags = processTags(ghPost.tags);
    } else {
        delete data.tags;
    }

    delete data.tiers;
    delete data.post_revisions;
    delete data.count;
    delete data.primary_author;
    delete data.primary_tag;

    return {
        url: ghPost.url,
        data
    };
};

const processPosts = (posts: GhostPost[]): ProcessedPost[] => {
    const results: ProcessedPost[] = [];
    for (const post of posts) {
        if (post) {
            results.push(processPost(post));
        }
    }
    return results;
};

const all = async ({result: input}: ProcessAllInput): Promise<ProcessAllOutput> => {
    return {
        users: processAuthors(input.users),
        posts: processPosts(input.posts)
    };
};

export default {
    processTags,
    processPost,
    processPosts,
    processAuthor,
    processAuthors,
    all
};
