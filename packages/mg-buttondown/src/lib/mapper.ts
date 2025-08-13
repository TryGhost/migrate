import errors from '@tryghost/errors';
import {processHTML} from './process.js';

const mapPost = ({postData, options}: {postData: buttondownPostDataObject, options?: any}) => {
    const postDate = new Date(postData.publish_date);

    const mappedData: mappedDataObject = {
        url: `${options.url}/${postData.slug}`,
        data: {
            slug: postData.slug,
            published_at: postDate,
            updated_at: postDate,
            created_at: postDate,
            title: postData.subject,
            type: 'post',
            html: postData.html!,
            status: 'published',
            custom_excerpt: null,
            visibility: 'public',
            tags: []
        }
    };

    mappedData.data.tags.push({
        url: 'migrator-added-tag-hash-buttondown',
        data: {
            slug: 'hash-buttondown',
            name: '#buttondown'
        }
    });

    mappedData.data.html = processHTML({postData: mappedData});

    return mappedData;
};

const mapPosts = async ({posts, options}: {posts: buttondownPostDataObject[], options: any}) => {
    const mappedPosts = posts.map((postData) => {
        return mapPost({postData, options});
    });

    return mappedPosts;
};

const mapContent = async (args: {options: any, posts?: object[], json: buttondownPostDataObject[]}) => {
    const output = {
        posts: [] as mappedDataObject[]
    };

    if (args?.posts && args?.posts?.length < 1) {
        return new errors.NoContentError({message: 'Input file is empty'});
    }

    // Inline the HTML we have with the CSV data
    args.json.map((post: any) => {
        const thisPostHTML: any = args?.posts?.find((item: any) => item.name === `${post.slug}.md`);
        post.html = thisPostHTML?.html ?? '';
        return post;
    });

    let mappedPosts: mappedDataObject[] = await mapPosts({posts: args.json, options: args.options});

    output.posts = mappedPosts;

    return output;
};

export {
    mapPosts,
    mapContent
};
