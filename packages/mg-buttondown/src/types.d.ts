declare module '@tryghost/debug';
declare module '@tryghost/mg-fs-utils';
declare module 'markdown-it';
declare module 'markdown-it-footnote';

type buttondownPostDataObject = {
    id: string;
    secondary_id: string;
    subject: string;
    publish_date: string;
    source: string;
    slug: string;
    html?: string;
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
        published_at: Date;
        updated_at: Date;
        created_at: Date;
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
