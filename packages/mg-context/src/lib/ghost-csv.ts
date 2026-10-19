export const GHOST_CSV_COLUMNS = [
    'title',
    'html',
    'slug',
    'custom_excerpt',
    'type',
    'status',
    'visibility',
    'featured',
    'created_at',
    'updated_at',
    'published_at',
    'feature_image',
    'feature_image_alt',
    'feature_image_caption',
    'meta_title',
    'meta_description',
    'canonical_url',
    'og_image',
    'og_title',
    'og_description',
    'twitter_image',
    'twitter_title',
    'twitter_description',
    'custom_template',
    'codeinjection_head',
    'codeinjection_foot',
    'authors',
    'author_emails',
    'tags'
] as const;

export interface CsvPostRelations {
    authors: Array<{name: string; email: string}>;
    tags: string[];
}

function csvCell(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvLine(values: readonly unknown[]): string {
    return `${values.map(csvCell).join(',')}\n`;
}

function cleanReferenceName(name: string): string {
    return name.replaceAll(',', ' ').replace(/\s+/g, ' ').trim();
}

export function csvPostLine(data: Record<string, unknown>, relations: CsvPostRelations): string {
    const row: Record<string, unknown> = {
        ...data,
        status: data.status === 'scheduled' || data.status === 'sent' ? 'draft' : data.status,
        authors: relations.authors.map(author => cleanReferenceName(author.name)).join(', '),
        author_emails: relations.authors.map(author => author.email).join(', '),
        tags: relations.tags.map(cleanReferenceName).join(', ')
    };
    return csvLine(GHOST_CSV_COLUMNS.map(column => row[column]));
}
