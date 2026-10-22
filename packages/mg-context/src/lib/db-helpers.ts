/* eslint-disable ghost/filenames/match-exported-class */
import {flushDatabaseEvents, type DatabaseModels} from './database.js';

export function withTransaction<T>(db: DatabaseModels, callback: () => T): T {
    if (db.inTransaction) {
        return callback();
    }

    db.db.exec('BEGIN');
    db.inTransaction = true;
    try {
        const result = callback();
        db.db.exec('COMMIT');
        db.inTransaction = false;
        flushDatabaseEvents(db);
        return result;
    } catch (err) {
        if (db.inTransaction) {
            db.db.exec('ROLLBACK');
        }
        throw err;
        /* c8 ignore next */
    } finally {
        db.inTransaction = false;
    }
}

export function findByIds(db: DatabaseModels, table: string, ids: number[]): any[] {
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map(() => '?').join(',');
    return db.db.prepare(`SELECT * FROM ${table} WHERE id IN (${placeholders})`).all(...ids);
}

export function findByColumn(
    db: DatabaseModels,
    table: string,
    column: string,
    ids: number[],
    orderBy?: string
): any[] {
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map(() => '?').join(',');
    /* c8 ignore next */
    const order = orderBy ? ` ORDER BY ${orderBy}` : '';
    return db.db.prepare(`SELECT * FROM ${table} WHERE ${column} IN (${placeholders})${order}`).all(...ids);
}

interface WhereClause {
    sql: string;
    params: (string | number | null)[];
}

interface DateRange {
    before?: Date;
    after?: Date;
    onOrBefore?: Date;
    onOrAfter?: Date;
}

function pushDateConditions(
    conditions: string[],
    params: (string | number | null)[],
    column: string,
    range: DateRange
) {
    if (range.after) {
        conditions.push(`${column} > ?`);
        params.push(range.after.toISOString());
    }
    if (range.onOrAfter) {
        conditions.push(`${column} >= ?`);
        params.push(range.onOrAfter.toISOString());
    }
    if (range.before) {
        conditions.push(`${column} < ?`);
        params.push(range.before.toISOString());
    }
    if (range.onOrBefore) {
        conditions.push(`${column} <= ?`);
        params.push(range.onOrBefore.toISOString());
    }
}

export function buildDateWhere(filter?: {createdAt?: DateRange; publishedAt?: DateRange}): WhereClause {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter?.createdAt) {
        pushDateConditions(conditions, params, 'created_at', filter.createdAt);
    }

    if (filter?.publishedAt) {
        conditions.push('published_at IS NOT NULL');
        pushDateConditions(conditions, params, 'published_at', filter.publishedAt);
    }

    return {
        sql: conditions.length > 0 ? conditions.join(' AND ') : '',
        params
    };
}

export function countWhere(db: DatabaseModels, where: WhereClause): number {
    const row = db.db.prepare(`SELECT COUNT(*) as count FROM Posts ${where.sql}`).get(...where.params) as any;
    return row.count;
}

export function findPostsWhere(db: DatabaseModels, where: WhereClause, limit: number, offset: number): any[] {
    return db.db
        .prepare(`SELECT * FROM Posts ${where.sql} ORDER BY id ASC LIMIT ? OFFSET ?`)
        .all(...where.params, limit, offset);
}
