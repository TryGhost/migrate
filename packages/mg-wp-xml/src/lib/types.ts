import type {GuestAuthors} from '@tryghost/mg-wp-api';

export type WordPressRecord = Record<string, any>;

export interface WordPressOptions {
    drafts?: boolean;
    pages?: boolean;
    posts?: boolean;
    tags?: boolean;
    cpt?: string[];
    customTaxonomies?: string[];
    addTag?: string | null;
    postsBefore?: string | null;
    postsAfter?: string | null;
    updatedAfter?: string | null;
    rawHtml?: boolean;
    featureImageCaption?: boolean;
    removeDuplicateFeatureImage?: boolean;
    excerpt?: boolean;
    excerptSelector?: string | null;
    url?: string;
    attachments?: any[];
    onWarning?: (details: {key: string; reason: string}) => void;
    /** Path to a WordPress XML export of Co-Authors Plus guest authors. */
    coAuthors?: string | null;
    /** Guest author profiles read from `coAuthors`, keyed by their `cap-` slug. */
    coAuthorProfiles?: GuestAuthors | null;
    [key: string]: any;
}

export interface LegacyAuthor {
    url: string;
    sourceKey?: string;
    data: Record<string, any>;
}

export interface MappedPost {
    url: string;
    wpPostType: string;
    data: Record<string, any>;
}

export {RecordDataError} from '@tryghost/mg-context';
