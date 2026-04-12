import ObjectID from 'bson-objectid';
import schema from '../utils/schema.js';
import hydrate from './hydrate.js';
/**
 * A resource might be a plain resource ready for import, or if it came from our migrate tooling,
 * probably an object with some metadata (like URL) and a `data` key with the resource fields
 * E.g.
 * {
 *   url: 'http://theoriginal.url/of/the/resource',
 *   data: {
 *     title: 'the data we've managed to get so far
 *   }
 * }
 *
 * It's expected that the data object represents known Ghost keys
 * We also need to ensure that each object has at least the bare minimum properties required for an import
 *
 */
const removeMeta = (resource) => {
    return resource.data || resource;
};

let slugs = {};

export const resetSlugs = () => {
    slugs = {};
};

// Ghost's post/tag slug max length (MySQL utf8mb4 index limit)
const GHOST_SLUG_MAX = 191;
const DEDUP_SUFFIX_LENGTH = 25; // '-' + 24-char ObjectID

const deduplicateSlugs = (obj, type) => {
    if (!slugs[type]) {
        slugs[type] = [];
    }

    if (slugs[type].includes(obj.slug)) {
        // @TODO: log some sort of warning for things like this?
        const objectID = new ObjectID();
        const maxBaseLength = GHOST_SLUG_MAX - DEDUP_SUFFIX_LENGTH;
        const baseSlug = obj.slug.length > maxBaseLength
            ? obj.slug.substring(0, maxBaseLength).trim()
            : obj.slug;
        obj.slug = `${baseSlug}-${objectID}`;
    }

    slugs[type].push(obj.slug);

    return obj;
};

const ensureValid = (resource, type, options) => {
    let obj = removeMeta(resource);

    if (obj.slug) {
        obj = deduplicateSlugs(obj, type);
    }

    if (type in hydrate) {
        obj = hydrate[type](obj, options);
    }

    return obj;
};

const normalizeKey = (key) => {
    let outputKey = null;

    if (schema.RESOURCES.includes(key)) {
        outputKey = key;
        // If this key is singular, convert to plural form
    } else if (key in schema.RESOURCE_SINGULAR_TO_PLURAL) {
        outputKey = schema.RESOURCE_SINGULAR_TO_PLURAL[key];
    }

    return outputKey;
};

const normalizeValue = (value) => {
    if (!Array.isArray(value)) {
        value = [value];
    }

    return value;
};

/**
 * We expect an object with keys that match Ghost resources
 * Iterate over each key and return only ones that we recognise
 */
export default (input, options) => {
    return Object.entries(input).reduce((data, [inputKey, inputValue]) => {
        let key = normalizeKey(inputKey);
        let entries = normalizeValue(inputValue);

        if (!key) {
            // We don't recognise this key, skip
            return data;
        }

        data[key] = entries.map(entry => ensureValid(entry, key, options));

        return data;
    }, {});
};
