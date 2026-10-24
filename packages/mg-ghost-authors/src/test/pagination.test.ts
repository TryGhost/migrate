import assert from 'node:assert/strict';
import {it, afterEach} from 'node:test';
import nock from 'nock';
import {
    fetchGhostUsers,
    streamGhostUsers,
    GhostUserFetchError,
    createGhostUserTasks,
    mergeUsersWithGhost
} from '../index.js';

const apiUrl = 'https://authors.example.com';
const adminKey = '0123456789abcdef01234567:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const user = {id: '0123456789abcdef01234567', slug: 'alice', name: 'Alice', email: 'alice@example.com'};
function page(number: number, users: any[], pages?: number) {
    return nock(apiUrl)
        .get('/ghost/api/admin/users/')
        .query({limit: 100, page: number, include: 'roles'})
        .reply(200, {users, ...(pages === undefined ? {} : {meta: {pagination: {page: number, pages}}})});
}
afterEach(() => {
    assert.equal(nock.pendingMocks().length, 0);
    nock.cleanAll();
});

async function collect(options: Parameters<typeof streamGhostUsers>[0]) {
    const result = [];
    for await (const value of streamGhostUsers(options)) {
        result.push(value);
    }
    return result;
}

it('streams paginated users with bounded page caches and reuses those caches', async () => {
    const cache = new Map<string, any>();
    const fileCache = {
        hasFile: (name: string) => cache.has(name),
        readTmpJSONFile: async (name: string) => cache.get(name),
        writeTmpFile: async (data: unknown, name: string) => {
            cache.set(name, data);
        }
    };
    page(1, [user], 2);
    page(2, [{...user, id: 'second'}], 2);
    const options = {apiUrl, adminKey, fileCache};
    assert.equal((await collect(options)).length, 2);
    assert.equal(cache.size, 2);
    assert.equal((await collect(options)).length, 2);
});

it('refreshes damaged optional page caches, handles absent pagination and reports fetch failures distinctly', async () => {
    page(1, [user]);
    assert.deepEqual(
        await collect({
            apiUrl,
            adminKey,
            fileCache: {
                hasFile: () => true,
                readTmpJSONFile: async () => {
                    throw new Error('bad cache');
                },
                writeTmpFile: async () => {}
            }
        }),
        [user]
    );
    page(1, [user], 1);
    assert.deepEqual(
        await collect({
            apiUrl,
            adminKey,
            fileCache: {
                hasFile: () => true,
                readTmpJSONFile: async () => ({users: [], next: 'invalid'}),
                writeTmpFile: async () => {}
            }
        }),
        [user]
    );
    page(1, [user]);
    await assert.rejects(
        collect({
            apiUrl,
            adminKey,
            fileCache: {
                hasFile: () => false,
                readTmpJSONFile: async () => [],
                writeTmpFile: async () => {
                    throw new Error('disk full');
                }
            }
        }),
        error => !(error instanceof GhostUserFetchError) && /disk full/.test(String(error))
    );
    nock(apiUrl)
        .get('/ghost/api/admin/users/')
        .query(true)
        .reply(401, {errors: [{message: 'Unauthorized'}]});
    await assert.rejects(collect({apiUrl, adminKey}), GhostUserFetchError);
    await assert.rejects(collect({apiUrl, adminKey: 'invalid'}), GhostUserFetchError);
    assert.deepEqual(await collect({apiUrl: '', adminKey}), []);
    assert.deepEqual(await collect({apiUrl, adminKey: ''}), []);
});

it('keeps legacy array fetching and cache failure behavior compatible', async () => {
    page(1, [user], 2);
    page(2, [{...user, id: 'second'}], 2);
    const files: string[] = [];
    assert.equal(
        (
            await fetchGhostUsers({
                apiUrl,
                adminKey,
                fileCache: {
                    hasFile: () => false,
                    readTmpJSONFile: async () => [],
                    writeTmpFile: async (_data, name) => {
                        files.push(name);
                    }
                }
            })
        ).length,
        2
    );
    assert.equal(files.length, 1);
    page(1, [user, user]);
    assert.deepEqual(await fetchGhostUsers({apiUrl: apiUrl + '/', adminKey}), [user, user]);
    page(1, [user, user]);
    assert.deepEqual(
        await fetchGhostUsers({
            apiUrl,
            adminKey,
            fileCache: {
                hasFile: () => true,
                readTmpJSONFile: async () => {
                    throw new Error('cache failed');
                },
                writeTmpFile: async () => {
                    throw new Error('cache failed');
                }
            }
        }),
        [user, user]
    );
});

it('retains legacy Ghost user task behavior including matching, skips, empty users and errors', async () => {
    for (const options of [{}, {ghostApiUrl: apiUrl}, {ghostAdminKey: adminKey}]) {
        assert.equal(createGhostUserTasks(options)[0].skip(), true);
    }
    const full = createGhostUserTasks({ghostApiUrl: apiUrl, ghostAdminKey: adminKey})[0];
    assert.equal(full.skip(), false);
    const ctx: any = {
        errors: [],
        result: {users: [{url: 'alice', data: {slug: 'alice', email: user.email}}]},
        fileCache: {hasFile: () => true, readTmpJSONFile: async () => [user]}
    };
    const output = {output: ''};
    await full.task(ctx, output);
    assert.equal(ctx.result.users[0].data.id, user.id);
    assert.match(output.output, /Merged/);
    ctx.result = {};
    await full.task(ctx, output);
    assert.match(output.output, /from cache/);
    ctx.fileCache.readTmpJSONFile = async () => [];
    await full.task(ctx, output);
    assert.equal(ctx.ghostUsers.length, 0);
    ctx.fileCache.hasFile = () => false;
    await createGhostUserTasks({ghostApiUrl: apiUrl, ghostAdminKey: 'bad'})[0].task(ctx, output);
    assert.equal(ctx.errors.length, 1);
    assert.deepEqual(ctx.ghostUsers, []);
    page(1, [user], 1);
    await full.task(ctx, output);
    assert.ok(!output.output.includes('from cache'));
});

it('tolerates nontext destination bios and mixed role representations', () => {
    const source = [{url: 'alice', data: {slug: 'alice', email: user.email}}];
    assert.equal(mergeUsersWithGhost(source, [{...user, bio: 42 as any}])[0].data.bio, undefined);
    assert.deepEqual(mergeUsersWithGhost(source, [{...user, roles: [{name: 'Editor'}, 'Author']}])[0].data.roles, [
        'Editor',
        'Author'
    ]);
    assert.deepEqual(mergeUsersWithGhost(source, [{...user, roles: [{} as any]}])[0].data.roles, ['Contributor']);
    assert.equal(mergeUsersWithGhost(source, [{...user, email: ''}])[0], source[0]);
    assert.equal(mergeUsersWithGhost(source, [{...user, bio: '<p> </p>'}])[0].data.bio, undefined);
});
