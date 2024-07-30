import fsUtils from '@tryghost/mg-fs-utils';
import {processHTML, removeDuplicateFeatureImage} from './process.js';
import {slugify} from '@tryghost/string';

const parsePostsCSV = async ({pathToFile}: {pathToFile: string}) => {
    const parseCSV = fsUtils.csv.parseCSV;
    let parsed = await parseCSV(pathToFile);

    return parsed;
};

const createSlug = ({domain, url, title}: {domain?: string, url: string, title?: string}) => {
    // Remove the trailing slash from the domain
    if (domain) {
        domain = domain.replace(/\/$/, '');
    }

    if (url && url.length > 0) {
        let cleanedUrl = url.replace(/https?:\/\/[a-z-A-Z0-9]+.beehiiv.com\/p\//, '');
        if (domain && domain.length > 0) {
            cleanedUrl = cleanedUrl.replace(`${domain}/p/`, '');
        }
        return slugify(cleanedUrl);
    } else if (title) {
        return slugify(title);
    }
};

const fullImageURL = (path: string) => {
    if (path.startsWith('uploads/') || path.startsWith('/uploads/')) {
        const noLeadingSlash = path.replace(/^\//, '');
        return `https://media.beehiiv.com/cdn-cgi/image/quality=100/${noLeadingSlash}`;
    } else {
        return path;
    }
};

const mapPost = ({postData, options}: {postData: beehiivPostDataObject, options?: any}) => {
    const domain = options?.url ?? false;
    const postSlug = createSlug({domain, url: postData.url, title: postData.web_title});

    const theAudience = postData.audience ?? postData.web_audiences ?? false;

    const mappedData: mappedDataObject = {
        url: postData.url,
        data: {
            slug: postSlug,
            published_at: postData.created_at,
            updated_at: postData.created_at,
            created_at: postData.created_at,
            title: postData.web_title,
            type: 'post',
            html: postData.content_html,
            status: (postData.status === 'confirmed') ? 'published' : 'draft',
            custom_excerpt: postData.web_subtitle ?? null,
            visibility: 'public',
            tags: []
        }
    };

    if (theAudience === 'premium' || theAudience === 'All premium subscribers') {
        mappedData.data.visibility = 'paid';
    } else if (theAudience === 'both') {
        mappedData.data.visibility = 'members';
    }

    if (mappedData.data.status === 'draft' && options?.defaultAuthorName) {
        const defaultAuthorName = options.defaultAuthorName;
        const defaultAuthorSlug = slugify(defaultAuthorName);
        const defaultAuthorEmail = `${defaultAuthorSlug}@example.com`;

        mappedData.data.author = {
            url: `migrator-added-author-${defaultAuthorSlug}`,
            data: {
                slug: defaultAuthorSlug,
                name: defaultAuthorName,
                email: defaultAuthorEmail
            }
        };
    }

    if (postData.thumbnail_url) {
        mappedData.data.feature_image = fullImageURL(postData.thumbnail_url);
    }

    mappedData.data.tags.push({
        url: 'migrator-added-tag-hash-beehiiv',
        data: {
            slug: 'hash-beehiiv',
            name: '#beehiiv'
        }
    });

    if (theAudience) {
        const theAudienceSlug = slugify(theAudience);
        mappedData.data.tags.push({
            url: `migrator-added-tag-hash-beehiiv-${theAudienceSlug}`,
            data: {
                slug: `hash-beehiiv-visibility-${theAudienceSlug}`,
                name: `#beehiiv-visibility-${theAudienceSlug}`
            }
        });
    }

    mappedData.data.html = processHTML({html: mappedData.data.html, postData: mappedData, allData: postData, options});

    if (mappedData.data.feature_image) {
        mappedData.data.html = removeDuplicateFeatureImage({html: mappedData.data.html, featureSrc: mappedData.data.feature_image});
    }

    return mappedData;
};

const mapPosts = async ({pathToFile, options}: {pathToFile: string, options: any}) => {
    let parsed = await parsePostsCSV({pathToFile});

    const mappedPosts = parsed.map((postData: beehiivPostDataObject) => {
        return mapPost({postData, options});
    });

    return mappedPosts;
};

const mapContent = async (args: {options: any}, logger?: any) => {
    const output = {
        posts: []
    };

    let mappedPosts = await mapPosts({pathToFile: args.options.posts, options: args.options});

    output.posts = output.posts.concat(mappedPosts);

    return output;
};

export {
    createSlug,
    fullImageURL,
    parsePostsCSV,
    mapPost,
    mapPosts,
    mapContent
};
