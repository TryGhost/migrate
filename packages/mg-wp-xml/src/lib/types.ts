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
    rawHtml?: boolean;
    featureImageCaption?: boolean;
    excerpt?: boolean;
    excerptSelector?: string | null;
    url?: string;
    attachments?: any[];
    onWarning?: (details: {key: string; reason: string}) => void;
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
