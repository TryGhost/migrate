import type {WordPressInput} from './lib/input.js';
import {xmlUtils} from '@tryghost/mg-utils';
import {inspectSource} from './lib/input.js';

export {inspectSource};
export {ingest, parse, sourceUrl} from './lib/ingest.js';
export {sourceSite} from './lib/mapping-state.js';
export {map, ghostId} from './lib/map.js';
export {RecordDataError} from './lib/types.js';
export type {WordPressOptions, WordPressRecord} from './lib/types.js';
export type {WordPressInput, SourceFile} from './lib/input.js';
export type {MappingSummary, MappingServices} from './lib/map.js';

export async function contentStats(input: string | WordPressInput): Promise<{posts: number; pages: number}> {
    const snapshot = typeof input === 'string' ? await inspectSource(input) : input;
    const result = {posts: 0, pages: 0};
    for (const file of snapshot.files) {
        for await (const record of xmlUtils.streamXmlRecords(file.path, {paths: ['rss/channel/item']})) {
            const type = xmlUtils.getText(record.value['wp:post_type']);
            if (type === 'post' || type === 'page') {
                result[type === 'post' ? 'posts' : 'pages']++;
            }
        }
    }
    return result;
}
