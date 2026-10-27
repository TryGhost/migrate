import fetch from './lib/fetch.js';
import process from './lib/processor.js';
import {makeInlinerUrls} from './lib/utils.js';

const discover = fetch.discover;

export default {
    discover,
    fetch,
    process
};

export {makeInlinerUrls};
export {
    wpCDNToLocal,
    processAuthor,
    processTerm,
    processTerms,
    processCoAuthors,
    processExcerpt,
    processShortcodes,
    processUnknownEmbedShortcodes,
    processContent,
    processPost,
    processAuthors
} from './lib/processor.js';
export type {ProcessContentArgs} from './lib/processor.js';
export type {LegacyAuthor, LegacyTag, MappedPost, WpApiOptions, WpApiRecord} from './lib/types.js';
export {ingest, parse, sourceSite} from './lib/ingest.js';
export {map, ghostId} from './lib/map.js';
export {discover, tasks} from './lib/fetch.js';
export type {IngestOptions} from './lib/ingest.js';
export type {MappingSummary, MappingServices} from './lib/map.js';
export type {ApiUser, DiscoverOptions, DiscoverResult, FetchOptions, FetchTask, TaskContext} from './lib/fetch.js';
