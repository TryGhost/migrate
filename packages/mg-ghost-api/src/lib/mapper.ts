import {AuthorContext, TagContext} from '@tryghost/mg-context';
import type {MigrateContext, PostContext} from '@tryghost/mg-context';

interface GhostApiAuthor {
    id?: string;
    name?: string;
    slug?: string;
    email?: string;
    profile_image?: string | null;
    cover_image?: string | null;
    bio?: string | null;
    website?: string | null;
    location?: string | null;
    facebook?: string | null;
    twitter?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    [key: string]: unknown;
}

interface GhostApiTag {
    id?: string;
    name?: string;
    slug?: string;
    description?: string | null;
    feature_image?: string | null;
    visibility?: string;
    og_image?: string | null;
    og_title?: string | null;
    og_description?: string | null;
    twitter_image?: string | null;
    twitter_title?: string | null;
    twitter_description?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    codeinjection_head?: string | null;
    codeinjection_foot?: string | null;
    canonical_url?: string | null;
    [key: string]: unknown;
}

export interface GhostApiPost {
    id?: string;
    url?: string;
    slug?: string;
    title?: string;
    type?: 'post' | 'page';
    status?: 'published' | 'draft' | 'scheduled' | 'sent';
    visibility?: 'public' | 'members' | 'paid';
    featured?: boolean;
    lexical?: string | null;
    feature_image?: string | null;
    feature_image_alt?: string | null;
    feature_image_caption?: string | null;
    custom_excerpt?: string | null;
    comment_id?: string | null;
    canonical_url?: string | null;
    custom_template?: string | null;
    codeinjection_head?: string | null;
    codeinjection_foot?: string | null;
    og_image?: string | null;
    og_title?: string | null;
    og_description?: string | null;
    twitter_image?: string | null;
    twitter_title?: string | null;
    twitter_description?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    published_at?: string | null;
    authors?: GhostApiAuthor[];
    tags?: GhostApiTag[];
    [key: string]: unknown;
}

const POST_OBJECT_FIELDS = [
    'title', 'slug', 'status', 'visibility', 'featured', 'type',
    'feature_image', 'feature_image_alt', 'feature_image_caption',
    'custom_excerpt', 'comment_id', 'canonical_url', 'custom_template',
    'codeinjection_head', 'codeinjection_foot',
    'og_image', 'og_title', 'og_description',
    'twitter_image', 'twitter_title', 'twitter_description',
    'meta_title', 'meta_description'
] as const;

const DATE_FIELDS = ['created_at', 'updated_at', 'published_at'] as const;

const MIGRATOR_TAG = {
    name: '#ghost',
    slug: 'hash-ghost',
    visibility: 'internal',
    description: 'Posts migrated from an existing Ghost installation'
};

const upgradeGravatar = (url: string): string => {
    let upgraded = url.replace(/s=([0-9]{1,4})/, 's=3000');
    upgraded = upgraded.replace(/^\/\/www\.gravatar\.com/, 'https://www.gravatar.com');
    return upgraded;
};

const buildAuthorData = (ghAuthor: GhostApiAuthor) => {
    const slug = ghAuthor.slug ?? '';
    const data: Record<string, unknown> = {
        name: ghAuthor.name,
        slug,
        email: ghAuthor.email ?? `${slug || 'unknown'}@migrated.invalid`,
        profile_image: ghAuthor.profile_image ?? null,
        cover_image: ghAuthor.cover_image ?? null,
        bio: ghAuthor.bio ?? null,
        website: ghAuthor.website ?? null,
        location: ghAuthor.location ?? null,
        facebook: ghAuthor.facebook ?? null,
        twitter: ghAuthor.twitter ?? null,
        meta_title: ghAuthor.meta_title ?? null,
        meta_description: ghAuthor.meta_description ?? null
    };

    if (typeof data.profile_image === 'string') {
        data.profile_image = upgradeGravatar(data.profile_image);
    }

    return data;
};

const buildTagData = (ghTag: GhostApiTag) => {
    return {
        name: ghTag.name,
        slug: ghTag.slug,
        description: ghTag.description ?? null,
        feature_image: ghTag.feature_image ?? null,
        visibility: ghTag.visibility ?? 'public',
        og_image: ghTag.og_image ?? null,
        og_title: ghTag.og_title ?? null,
        og_description: ghTag.og_description ?? null,
        twitter_image: ghTag.twitter_image ?? null,
        twitter_title: ghTag.twitter_title ?? null,
        twitter_description: ghTag.twitter_description ?? null,
        meta_title: ghTag.meta_title ?? null,
        meta_description: ghTag.meta_description ?? null,
        codeinjection_head: ghTag.codeinjection_head ?? null,
        codeinjection_foot: ghTag.codeinjection_foot ?? null,
        canonical_url: ghTag.canonical_url ?? null
    };
};

const toDate = (value: string | null | undefined): Date | null => {
    if (!value) {
        return null;
    }
    return new Date(value);
};

export async function mapPost(ghPost: GhostApiPost, migrateContext: MigrateContext): Promise<PostContext> {
    const post = await migrateContext.addPost({
        source: {url: ghPost.url, id: ghPost.id},
        lookupKey: ghPost.id
    });

    for (const field of POST_OBJECT_FIELDS) {
        const value = ghPost[field];
        if (value !== undefined && value !== null) {
            post.set(field, value);
        }
    }

    for (const field of DATE_FIELDS) {
        const date = toDate(ghPost[field] as string | null | undefined);
        if (date) {
            post.set(field, date);
        }
    }

    if (ghPost.lexical) {
        post.set('lexical', ghPost.lexical);
    }

    if (ghPost.tags) {
        for (const tag of ghPost.tags) {
            if (tag?.slug) {
                post.addTag(new TagContext({initialData: buildTagData(tag)}));
            }
        }
    }

    post.addTag(new TagContext({initialData: MIGRATOR_TAG}));

    if (ghPost.authors) {
        for (const author of ghPost.authors) {
            if (author?.slug) {
                post.addAuthor(new AuthorContext({initialData: buildAuthorData(author)}));
            }
        }
    }

    return post;
}

