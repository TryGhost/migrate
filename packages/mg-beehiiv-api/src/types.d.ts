declare module '@tryghost/errors';
declare module '@tryghost/kg-default-cards/lib/cards/image.js';
declare module '@tryghost/kg-default-cards/lib/cards/embed.js';
declare module '@tryghost/kg-default-cards/lib/cards/bookmark.js';
declare module '@tryghost/mg-fs-utils';
declare module '@tryghost/string';
declare module 'sanitize-html';

type beehiivPostDataObject = {
    id: string;
    title: string;
    subtitle: string;
    authors: string[];
    created: number;
    status: 'archived' | 'confirmed' | 'draft';
    publish_date: number;
    displayed_date: null,
    split_tested: false,
    subject_line: string;
    preview_text: string;
    slug: string;
    thumbnail_url: string;
    web_url: string;
    audience: 'free' | 'premium' | 'both';
    platform: 'web' | 'email' | 'both';
    content_tags: string[];
    meta_default_description: null,
    meta_default_title: null,
    hidden_from_feed: boolean;
    enforce_gated_content: boolean;
    email_capture_popup: boolean;
    content: {
        premium: {
            web: string;
        }
    }
    // content: { premium: [Object] }
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
        comment_id: string;
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
        authors: authorsObject[];
        og_title?: string;
        og_description?: string;
    };
};
