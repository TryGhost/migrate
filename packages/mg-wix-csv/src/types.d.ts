declare module '@tryghost/mg-fs-utils';
declare module '@tryghost/errors';
declare module '@tryghost/string';
declare module 'simple-dom';

type wixCSVPostDataObject = {
    Author?: string;
    'Main Category'?: string;
    ID?: string;
    Tags?: string;
    Featured?: string;
    Slug?: string;
    'Cover Image'?: string;
    'Plain Content'?: string;
    'Published Date'?: string;
    Pinned?: string;
    Categories?: string;
    'Rich Content'?: string;
    'Post Page URL'?: string;
    Title?: string;
    Excerpt?: string;
    'Last Published Date'?: string;
    'Internal ID'?: string;
};

type tagsObject = {
    url: string;
    data: {
        slug: string;
        name: string;
    };
};

type authorsObject = {
    url: string;
    data: {
        slug: string;
        name: string;
        email: string;
    };
};

type mappedDataObject = {
    url: string;
    data: {
        slug: string;
        comment_id: string | null;
        published_at: Date | null;
        updated_at: Date | null;
        created_at: Date;
        title: string;
        type: 'post';
        html: string;
        plaintext: string | null;
        status: 'published' | 'draft';
        custom_excerpt: string | null;
        visibility: 'public';
        featured: boolean;
        tags: tagsObject[];
        author: authorsObject;
        feature_image?: string;
    };
};
