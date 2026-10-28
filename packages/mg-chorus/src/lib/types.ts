/* c8 ignore start */
/** One block of a Chorus entry body, such as an `EntryBodyParagraph`. */
export interface ChorusComponent {
    __typename?: string;
    [field: string]: any;
}

/** A Chorus entry, as stored in an `Entry:<id>.json` file of the export. */
export interface ChorusEntry {
    uid?: string;
    title?: string;
    /** The subtitle, as HTML. */
    dek?: {html?: string} | null;
    url?: string;
    createdAt?: string;
    updatedAt?: string;
    author?: {fullOrUserName?: string} | null;
    authorProfile?: {name?: string} | null;
    contributors?: ({fullOrUserName?: string} | null)[] | null;
    communityGroups?: ({name?: string} | null)[] | null;
    body?: {components?: ChorusComponent[] | null} | null;
    [field: string]: unknown;
}

export interface ChorusOptions {
    /** The live site's URL. It scopes the stable Ghost IDs. */
    url?: string;
    /** A tag added to every post, before its community groups. */
    addPrimaryTag?: string | false | null;
    [key: string]: any;
}
/* c8 ignore stop */
