import {AuthorContext, TagContext} from '@tryghost/mg-context';
import type {MappingState} from '@tryghost/mg-context';
import {mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {slugify} from '@tryghost/string';

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** The stable Ghost ID for an entity of `kind` with source `key`, scoped to one adapter and site. */
export type IdFor = (kind: 'post' | 'tag' | 'author', key: string) => string;

/** Reserve existing Ghost users' slugs and remember them by lowercase email, for `namedAuthor()` to match. */
export async function rememberGhostUsers(
    state: MappingState,
    users: Iterable<GhostUser> | AsyncIterable<GhostUser> = []
): Promise<void> {
    for await (const user of users) {
        state.reserveSlug('author', user.slug, user.id);
        if (user.email) {
            state.set('ghost-user', user.email.toLowerCase(), user);
        }
    }
}

/**
 * The saved author for a beehiiv author name. beehiiv names authors without an ID or email, so names with the
 * same slug are one author, with a `<slug>@example.com` email. A Ghost user remembered with that email supplies
 * its ID, name and slug; otherwise the slug is suffixed around Ghost users' slugs.
 */
export function namedAuthor(state: MappingState, name: string, idFor: IdFor): AuthorContext {
    const context = state.context;
    const slug = slugify(name) || 'author';
    const key = `slug:${slug}`;
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    let data: Record<string, any> = {name: name.trim(), slug, email: `${slug}@example.com`};
    const match = state.get('ghost-user', data.email);
    if (match) {
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
    }
    const id = data.id || idFor('author', key);
    delete data.id;
    if (data.roles?.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: key,
            reason: 'Unsupported author roles replaced by supported Ghost roles'
        });
        data.roles = data.roles.filter((role: string) => ROLES.includes(role));
        if (!data.roles.length) {
            data.roles = ['Contributor'];
        }
    }
    data.slug = state.uniqueSlug('author', data.slug, id);
    const entity = new AuthorContext();
    for (const [field, value] of Object.entries(data)) {
        if (value !== undefined) {
            entity.set(field, value);
        }
    }
    entity.ghostId = id;
    entity.save(context.db);
    state.bind('author', key, entity.dbId!);
    return entity;
}

/**
 * A tag for a beehiiv tag name. beehiiv tags are identified by slug, so tags that share a slug are one Ghost tag.
 * Names starting with `#` are internal tags, with a `hash-` slug.
 */
export function namedTag(name: string, idFor: IdFor, slug = slugify(name)): TagContext {
    if (name.startsWith('#') && !slug.startsWith('hash-')) {
        slug = `hash-${slug}`;
    }
    const tag = new TagContext({name, slug});
    tag.ghostId = idFor('tag', `slug:${slug}`);
    return tag;
}

/** Order tags public first, then internal (`#`) tags, keeping their order otherwise. */
export function publicFirst<T extends {data: {name: string}}>(tags: T[]): T[] {
    return [...tags].sort((a, b) => Number(a.data.name.startsWith('#')) - Number(b.data.name.startsWith('#')));
}
