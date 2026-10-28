/* c8 ignore start */
/** One email from a Buttondown export's `emails.json`, or one row of its `emails.csv`. */
export interface ButtondownEmail {
    id?: string;
    secondary_id?: string | number;
    subject?: string;
    publish_date?: string;
    source?: string;
    slug?: string;
    [field: string]: unknown;
}

export interface ButtondownOptions {
    /** The live site URL, such as `https://example.com`. Each email's old URL is `<url>/<slug>`. Required. */
    url: string;
    [key: string]: any;
}
/* c8 ignore stop */
