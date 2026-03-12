// import fsUtils from '@tryghost/mg-fs-utils';
import {slugify} from '@tryghost/string';
import {processHTML, removeDuplicateFeatureImage} from './process.js';

const mapPost = ({postData, options}: {postData: beehiivPostDataObject, options?: any}) => {
    const mappedData: mappedDataObject = {
        url: postData.web_url,
        data: {
            comment_id: postData.id,
            slug: postData.slug,
            published_at: new Date(postData.publish_date * 1000),
            updated_at: new Date(postData.publish_date * 1000),
            created_at: new Date(postData.created * 1000),
            title: postData.title,
            type: 'post',
            html: postData.content.premium.web,
            status: (postData.status === 'confirmed') ? 'published' : 'draft',
            custom_excerpt: postData.subtitle ?? null,
            visibility: (postData.audience === 'premium') ? 'paid' : 'public',
            authors: [],
            tags: []
        }
    };

    if (postData.thumbnail_url) {
        mappedData.data.feature_image = postData.thumbnail_url;
    }

    if (postData.meta_default_title) {
        mappedData.data.og_title = postData.meta_default_title;
    }

    if (postData.meta_default_description) {
        mappedData.data.og_description = postData.meta_default_description;
    }

    mappedData.data.html = processHTML({
        post: mappedData,
        options
    });

    postData.authors.forEach((author: string) => {
        const authorSlug = slugify(author);
        mappedData.data.authors.push({
            url: `migrator-added-author-${authorSlug}`,
            data: {
                slug: authorSlug,
                name: author,
                email: `${authorSlug}@example.com`
            }
        });
    });

    postData.content_tags.forEach((tag: string) => {
        const tagSlug = slugify(tag);
        mappedData.data.tags.push({
            url: `migrator-added-tag-${tagSlug}`,
            data: {
                slug: tagSlug,
                name: tag
            }
        });
    });

    mappedData.data.tags.push({
        url: 'migrator-added-tag-hash-beehiiv',
        data: {
            slug: 'hash-beehiiv',
            name: '#beehiiv'
        }
    });

    return mappedData;
};

const mapPostsTasks = async (options: any, ctx: any) => {
    let tasks: any = [];

    ctx.result.posts.forEach((postData: any, index: number) => {
        tasks.push({
            title: `Mapping post: ${postData.title}`,
            task: async (_: any, task: any) => {
                try {
                    const mappedPost = mapPost({postData, options});
                    ctx.result.posts[index] = mappedPost;
                } catch (error) {
                    /* c8 ignore next */
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    task.output = errorMessage;
                    throw error;
                }
            }
        });
    });

    return tasks;
};

export {
    mapPost,
    mapPostsTasks
};
