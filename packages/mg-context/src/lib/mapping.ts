import {createHash} from 'node:crypto';
import type {SourceRecord} from './SourceRecords.js';

/** Diagnostic types that runners report as warnings in a migration summary. */
export const WARNING_EVENT_TYPES: readonly string[] = Object.freeze([
    'source:conflict',
    'operation:warning',
    'field:sanitized',
    'slug:renamed',
    'record:skipped'
]);

/** A known problem with one source record. `mapRecords()` skips and reports it instead of failing the run. */
export class RecordDataError extends Error {}

export interface MappingSummary {
    selected: number;
    imported: number;
    skipped: number;
}

/** Map one record. Return `false` when the record is not selected; anything else counts as imported. */
export type RecordMapper = (record: SourceRecord) => unknown;

/**
 * Deterministic 24-character destination ID. The namespace names the adapter and its ID scheme version,
 * so changing the scheme deliberately changes every ID.
 */
export function ghostId(namespace: string, site: string, kind: string, key: string): string {
    return createHash('sha256')
        .update(JSON.stringify([namespace, site, kind, key]))
        .digest('hex')
        .slice(0, 24);
}
