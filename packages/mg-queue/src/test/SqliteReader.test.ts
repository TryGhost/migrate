import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {SqliteDatabase, SqliteReader, SqliteRow, SqliteStatement} from '../index.js';

async function collectRows(source: AsyncIterable<SqliteRow>): Promise<SqliteRow[]> {
    const rows: SqliteRow[] = [];
    for await (const row of source) {
        rows.push(row);
    }
    return rows;
}

interface MockDatabaseResult {
    database: SqliteDatabase;
    closeCalls: number;
    execCalls: string[];
    preparedSql: string[];
    allCalls: Array<{sql: string; parameters: unknown[]}>;
    runCalls: Array<{sql: string; parameters: unknown[]}>;
}

function createMockDatabase(config?: {
    all?: (sql: string, parameters: unknown[]) => Record<string, unknown>[];
    run?: (sql: string, parameters: unknown[]) => unknown;
}): MockDatabaseResult {
    let closeCalls = 0;
    const execCalls: string[] = [];
    const preparedSql: string[] = [];
    const allCalls: Array<{sql: string; parameters: unknown[]}> = [];
    const runCalls: Array<{sql: string; parameters: unknown[]}> = [];

    const database: SqliteDatabase = {
        exec(source: string): unknown {
            execCalls.push(source);
            return null;
        },
        prepare<T = Record<string, unknown>>(source: string): SqliteStatement<T> {
            preparedSql.push(source);

            return {
                all(...parameters: unknown[]): T[] {
                    allCalls.push({sql: source, parameters});
                    if (!config?.all) {
                        return [];
                    }

                    return config.all(source, parameters) as T[];
                },
                run(...parameters: unknown[]): unknown {
                    runCalls.push({sql: source, parameters});
                    if (!config?.run) {
                        return null;
                    }

                    return config.run(source, parameters);
                }
            };
        },
        close(): void {
            closeCalls += 1;
        }
    };

    return {
        database,
        get closeCalls() {
            return closeCalls;
        },
        execCalls,
        preparedSql,
        allCalls,
        runCalls
    };
}

describe('SqliteReader', () => {
    it('throws when dbPath is empty', () => {
        assert.throws(() => {
            new SqliteReader({dbPath: '   '});
        }, /dbPath must be a non-empty string/);
    });

    it('configures SQLite for concurrent reads and writes', async () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await reader.configureForConcurrentAccess();

        assert.ok(mock.execCalls.includes('PRAGMA journal_mode = WAL'));
        assert.ok(mock.execCalls.includes('PRAGMA synchronous = NORMAL'));
    });

    it('executes raw SQL', async () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await reader.execute('VACUUM;');
        assert.deepEqual(mock.execCalls, ['VACUUM;']);
    });

    it('streams rows in batches by incrementing id', async () => {
        const mock = createMockDatabase({
            all: (_sql, parameters) => {
                const [lastSeenId] = parameters;

                if (lastSeenId === 0) {
                    return [
                        {id: 1, title: 'Post 1', body: 'Body one'},
                        {id: 2, title: 'Post 2', body: 'Body two'}
                    ];
                }

                if (lastSeenId === 2) {
                    return [
                        {id: 3, title: 'Post 3', body: 'Body three'}
                    ];
                }

                return [];
            }
        });

        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        const rows = await collectRows(reader.streamRowsById({
            table: 'posts',
            columns: ['id', 'title', 'body'],
            batchSize: 2
        }));

        assert.equal(rows.length, 3);
        assert.equal(rows[0].id, '1');
        assert.equal(rows[1].title, 'Post 2');
        assert.equal(rows[2].body, 'Body three');
        assert.equal(mock.preparedSql.length, 1);
        assert.match(mock.preparedSql[0], /WHERE "id" > \?/);
        assert.match(mock.preparedSql[0], /LIMIT \?/);
        assert.equal(mock.allCalls.length, 3);
    });

    it('updates a row by id with bound parameters', async () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await reader.updateRowById({
            table: 'posts',
            id: 42,
            values: {
                title: 'Ghost\'s migration',
                published: true,
                body: null
            }
        });

        assert.equal(mock.runCalls.length, 1);
        assert.match(mock.runCalls[0].sql, /UPDATE "posts"/);
        assert.match(mock.runCalls[0].sql, /"title" = \?/);
        assert.match(mock.runCalls[0].sql, /"published" = \?/);
        assert.match(mock.runCalls[0].sql, /"body" = \?/);
        assert.match(mock.runCalls[0].sql, /WHERE "id" = \?/);
        assert.deepEqual(mock.runCalls[0].parameters, [null, 1, 'Ghost\'s migration', 42]);
    });

    it('reuses prepared update statements with the same shape', async () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await reader.updateRowById({
            table: 'posts',
            id: 1,
            values: {
                title: 'Post one',
                published: true
            }
        });
        await reader.updateRowById({
            table: 'posts',
            id: 2,
            values: {
                published: false,
                title: 'Post two'
            }
        });

        assert.equal(mock.preparedSql.length, 1);
        assert.equal(mock.runCalls.length, 2);
    });

    it('selects id even when omitted from columns', async () => {
        const mock = createMockDatabase({
            all: (_sql, parameters) => {
                const [lastSeenId] = parameters;
                if (lastSeenId === 0) {
                    return [{id: 7, title: 'Post 7'}];
                }

                return [];
            }
        });
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        const rows = await collectRows(reader.streamRowsById({
            table: 'posts',
            columns: ['title'],
            batchSize: 5
        }));

        assert.equal(rows.length, 1);
        assert.equal(rows[0].id, '7');
        assert.equal(rows[0].title, 'Post 7');
        assert.match(mock.preparedSql[0], /SELECT "id", "title"/);
    });

    it('updates multiple rows in one transaction', async () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await reader.updateRowsById({
            table: 'posts',
            rows: [
                {id: 1, values: {title: 'Post one'}},
                {id: 2, values: {title: 'Post two'}}
            ]
        });

        assert.deepEqual(mock.execCalls, ['BEGIN', 'COMMIT']);
        assert.equal(mock.preparedSql.length, 1);
        assert.equal(mock.runCalls.length, 2);
    });

    it('rolls back batch updates when a row update fails', async () => {
        let runCount = 0;
        const mock = createMockDatabase({
            run: () => {
                runCount += 1;
                if (runCount === 2) {
                    throw new Error('boom');
                }
                return null;
            }
        });
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await assert.rejects(async () => {
            await reader.updateRowsById({
                table: 'posts',
                rows: [
                    {id: 1, values: {title: 'Post one'}},
                    {id: 2, values: {title: 'Post two'}}
                ]
            });
        }, /boom/);

        assert.deepEqual(mock.execCalls, ['BEGIN', 'ROLLBACK']);
    });

    it('validates stream options and identifiers', async () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await assert.rejects(async () => {
            await collectRows(reader.streamRowsById({
                table: 'posts',
                columns: []
            }));
        }, /requires at least one selected column/);

        await assert.rejects(async () => {
            await collectRows(reader.streamRowsById({
                table: 'posts',
                columns: ['id'],
                batchSize: 0
            }));
        }, /batchSize must be an integer greater than 0/);

        await assert.rejects(async () => {
            await collectRows(reader.streamRowsById({
                table: 'posts',
                columns: ['id'],
                startAfterId: -1
            }));
        }, /startAfterId must be an integer greater than or equal to 0/);

        await assert.rejects(async () => {
            await collectRows(reader.streamRowsById({
                table: 'posts;DROP TABLE posts',
                columns: ['id']
            }));
        }, /identifier .* is invalid/);

        await assert.rejects(async () => {
            await reader.updateRowById({
                table: 'posts',
                id: 1,
                values: {}
            });
        }, /requires at least one value/);

        await assert.rejects(async () => {
            await reader.updateRowById({
                table: 'posts',
                id: 1,
                values: {
                    score: Number.POSITIVE_INFINITY
                }
            });
        }, /numeric value must be finite/);
    });

    it('throws when ids are not strictly increasing', async () => {
        const mock = createMockDatabase({
            all: () => [{id: 0, title: 'Title'}]
        });
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await assert.rejects(async () => {
            await collectRows(reader.streamRowsById({
                table: 'posts',
                columns: ['id', 'title']
            }));
        }, /expected increasing integer IDs/);
    });

    it('does not close externally provided database', () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        reader.close();
        assert.equal(mock.closeCalls, 0);
    });

    it('exposes the underlying database instance', () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        assert.equal(reader.database, mock.database);
    });

    it('creates a real database when no mock is provided', () => {
        const reader = new SqliteReader({dbPath: ':memory:'});

        assert.ok(reader.database);
        reader.close();
    });

    it('creates a real database with custom timeout', () => {
        const reader = new SqliteReader({dbPath: ':memory:', timeoutMs: 1000});

        assert.ok(reader.database);
        reader.close();
    });

    it('skips batch update when rows array is empty', async () => {
        const mock = createMockDatabase();
        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        await reader.updateRowsById({
            table: 'posts',
            rows: []
        });

        assert.equal(mock.execCalls.length, 0);
        assert.equal(mock.runCalls.length, 0);
    });

    it('swallows rollback failure and surfaces original error', async () => {
        let runCount = 0;
        const execCalls: string[] = [];
        const database: SqliteDatabase = {
            exec(source: string): unknown {
                execCalls.push(source);
                if (source === 'ROLLBACK') {
                    throw new Error('rollback failed');
                }
                return null;
            },
            prepare<T = Record<string, unknown>>(): SqliteStatement<T> {
                return {
                    all(): T[] {
                        return [];
                    },
                    run(): unknown {
                        runCount += 1;
                        if (runCount === 1) {
                            throw new Error('original error');
                        }
                        return null;
                    }
                };
            },
            close(): void {}
        };

        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database
        });

        await assert.rejects(async () => {
            await reader.updateRowsById({
                table: 'posts',
                rows: [
                    {id: 1, values: {title: 'A'}},
                    {id: 2, values: {title: 'B'}}
                ]
            });
        }, /original error/);

        assert.ok(execCalls.includes('ROLLBACK'));
    });

    it('normalizes null and undefined values to empty strings', async () => {
        const mock = createMockDatabase({
            all: (_sql, parameters) => {
                const [lastSeenId] = parameters;
                if (lastSeenId === 0) {
                    return [{id: 1, title: null, body: undefined}];
                }
                return [];
            }
        });

        const reader = new SqliteReader({
            dbPath: '/tmp/db.sqlite',
            database: mock.database
        });

        const rows = await collectRows(reader.streamRowsById({
            table: 'posts',
            columns: ['id', 'title', 'body'],
            batchSize: 10
        }));

        assert.equal(rows.length, 1);
        assert.equal(rows[0].title, '');
        assert.equal(rows[0].body, '');
    });
});
