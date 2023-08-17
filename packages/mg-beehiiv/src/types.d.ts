declare module '@tryghost/mg-fs-utils';
declare module '@tryghost/string';
declare module 'sanitize-html';

type beehiivPostDataObject = {
    id: string;
    web_title: string;
    status: 'archived' | 'confirmed' | 'draft'
    audience: 'both' | 'free' | 'premium'
    url: string;
    web_subtitle?: string;
    email_subject_line: string;
    email_preview_text: string;
    content_html: string;
    thumbnail_url: string;
    created_at: string;
};

type tagsObject = {
    url: string;
    data: {
        slug: string;
        name: string;
    }
};

type authorsObject = {
    url: string;
    data: {
        slug: string;
        name: string;
        email: string;
    }
};

type mappedDataObject = {
    url: string;
    data: {
        slug: string;
        published_at: string;
        updated_at: string;
        created_at: string;
        title: string;
        type: string;
        html: string;
        status: 'published' | 'draft';
        custom_excerpt: string | null;
        visibility: 'public' | 'members' | 'paid';
        tags: tagsObject[];
        feature_image?: string;
        author?: authorsObject;
    };
};
