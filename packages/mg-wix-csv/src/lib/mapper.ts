import errors from '@tryghost/errors';
import fsUtils from '@tryghost/mg-fs-utils';
import {slugify} from '@tryghost/string';
import {richContentToHtml} from './rich-content.js';
import {wixImageUriToUrl} from './wix-image.js';

const parsePostsCSV = async ({pathToFile}: {pathToFile: string}) => {
    const parseCSV = fsUtils.csv.parseCSV;
    const parsed = await parseCSV(pathToFile);

    return parsed as wixCSVPostDataObject[];
};

const parseDate = (value?: string) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const parseBoolean = (value?: string) => {
    return typeof value === 'string' && value.toLowerCase() === 'true';
};

const parseIdArray = (value?: string) => {
    if (!value) {
        return [];
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    } catch (error) {
        return [trimmed];
    }
};

const uniqueIds = (ids: string[]) => {
    return [...new Set(ids.filter(Boolean))];
};

const looksLikeWixId = (value: string) => {
    return /^[a-f0-9]{24}$/i.test(value);
};

const createTag = (value: string) => {
    const slug = looksLikeWixId(value) ? value : slugify(value);

    return {
        url: `migrator-added-tag-${slug}`,
        data: {
            slug,
            name: value
        }
    };
};

const createAuthor = ({name, defaultAuthorName}: {name?: string, defaultAuthorName?: string}) => {
    const authorName = name?.trim() || defaultAuthorName?.trim() || 'Author';
    const authorSlug = slugify(authorName);

    return {
        url: `migrator-added-author-${authorSlug}`,
        data: {
            slug: authorSlug,
            name: authorName,
            email: `${authorSlug}@example.com`
        }
    };
};

const buildPostUrl = ({url, path}: {url?: string, path?: string}) => {
    if (!url || !path) {
        return path || '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }

    return `${url}${path.startsWith('/') ? '' : '/'}${path}`;
};

const createSlug = ({slug, title}: {slug?: string, title?: string}) => {
    if (slug && slug.trim().length > 0) {
        return slugify(slug);
    }

    return slugify(title || 'untitled');
};

const shouldInclude = (value: boolean | undefined) => {
    return value !== false;
};

const mapTags = (postData: wixCSVPostDataObject, options?: any) => {
    const categories = parseIdArray(postData.Categories);
    const tags = parseIdArray(postData.Tags);
    const mainCategory = postData['Main Category'];
    const includeMainCategory = shouldInclude(options?.includeMainCategory);
    const includeCategories = shouldInclude(options?.includeCategories);
    const includeTags = shouldInclude(options?.includeTags);
    const shouldDropLegacyMainCategoryId = mainCategory && !looksLikeWixId(mainCategory) && categories[0] && looksLikeWixId(categories[0]);
    const secondaryCategories = shouldDropLegacyMainCategoryId ? categories.slice(1) : categories;
    const orderedCategories = uniqueIds([
        ...(includeMainCategory && mainCategory ? [mainCategory] : []),
        ...(includeCategories ? secondaryCategories : [])
    ]);

    return [
        ...uniqueIds([
            ...orderedCategories,
            ...(includeTags ? tags : [])
        ]).map(createTag),
        {
            url: 'migrator-added-tag-hash-wix',
            data: {
                slug: 'hash-wix',
                name: '#wix'
            }
        }
    ];
};

const mapPost = ({postData, options}: {postData: wixCSVPostDataObject, options?: any}) => {
    const publishedAt = parseDate(postData['Published Date']);
    const updatedAt = parseDate(postData['Last Published Date']) || publishedAt;
    const createdAt = publishedAt || updatedAt || new Date();
    const postSlug = createSlug({slug: postData.Slug, title: postData.Title});
    const featureImage = wixImageUriToUrl(postData['Cover Image']);

    const mappedData: mappedDataObject = {
        url: buildPostUrl({url: options?.url, path: postData['Post Page URL']}),
        data: {
            slug: postSlug,
            comment_id: postData['Internal ID'] || null,
            published_at: publishedAt,
            updated_at: updatedAt,
            created_at: createdAt,
            title: postData.Title || postSlug,
            type: 'post',
            html: richContentToHtml({
                richContent: postData['Rich Content'],
                plainContent: postData['Plain Content']
            }),
            plaintext: postData['Plain Content'] || null,
            status: publishedAt ? 'published' : 'draft',
            custom_excerpt: postData.Excerpt || null,
            visibility: 'public',
            featured: parseBoolean(postData.Featured),
            tags: mapTags(postData, options),
            author: createAuthor({
                name: postData.Author,
                defaultAuthorName: options?.defaultAuthorName
            })
        }
    };

    if (featureImage) {
        mappedData.data.feature_image = featureImage;
    }

    return mappedData;
};

const mapPosts = async ({pathToFile, options}: {pathToFile: string, options: any}) => {
    const parsed = await parsePostsCSV({pathToFile});

    return parsed.map((postData: wixCSVPostDataObject) => {
        return mapPost({postData, options});
    });
};

const mapContent = async (args: {options: any}) => {
    const output = {
        posts: [] as mappedDataObject[]
    };

    const mappedPosts = await mapPosts({pathToFile: args.options.posts, options: args.options});

    if (mappedPosts.length < 1) {
        return new errors.NoContentError({message: 'Input file is empty'});
    }

    output.posts = mappedPosts;

    return output;
};

export {
    buildPostUrl,
    createAuthor,
    createSlug,
    mapContent,
    mapPost,
    mapTags,
    parseBoolean,
    parseDate,
    parseIdArray,
    parsePostsCSV,
    uniqueIds
};
