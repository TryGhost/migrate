import {parse} from 'csv-parse/sync';
import {decode} from 'html-entities';
import MarkdownIt from 'markdown-it';
import mgHtmlLexical from '@tryghost/mg-html-lexical';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import errors from '@tryghost/errors';
import fsUtils from '@tryghost/mg-fs-utils';

const md = new MarkdownIt({
    html: true
});

// Required fields in the CSV export
const REQUIRED_FIELDS = ['title', 'slug', 'published date', 'content'];

/**
 * Parse tags from Bear Blog format
 * @param {string} tagString - Tag string in format "[tag1, tag2, tag3]"
 * @returns {Array<Object>} Array of tag objects
 */
const parseTags = (tagString) => {
    if (!tagString) {
        return [];
    }

    // Remove brackets and split by comma, which Bear Blog adds
    const tags = tagString
        .slice(1, -1) // Remove [ and ]
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean) // Remove empty tags
        .map(tag => ({
            url: tag.trim(),
            data: {
                name: tag.trim(),
                slug: tag.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_#]/g, '')
            }
        }));

    return tags;
};

/**
 * Validate CSV data has required fields
 * @param {Array<Object>} posts - Array of post objects from CSV
 * @throws {errors.ValidationError} If required fields are missing
 */
const validatePosts = (posts) => {
    if (!Array.isArray(posts) || posts.length === 0) {
        throw new errors.ValidationError({
            message: 'Invalid CSV format: No posts found'
        });
    }

    // Check if we have any object with properties
    if (!posts.some(post => Object.keys(post).length > 0)) {
        throw new errors.ValidationError({
            message: 'Invalid CSV format: No valid columns found'
        });
    }

    const firstPost = posts[0];
    const missingFields = REQUIRED_FIELDS.filter(field => !(field in firstPost));

    if (missingFields.length > 0) {
        throw new errors.ValidationError({
            message: `Missing required fields: ${missingFields.join(', ')}`
        });
    }
};

/**
 * Validate basic CSV structure
 * @param {string} input - CSV content
 * @throws {errors.ValidationError} If CSV structure is invalid
 */
const validateCsvStructure = (input) => {
    try {
        const parsed = parse(input, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: false,
            relax_quotes: true,
            relax: false
        });

        if (parsed.length === 0) {
            throw new errors.ValidationError({
                message: 'Invalid CSV format: File must have a header row and at least one data row'
            });
        }

        const foundFields = new Set(Object.keys(parsed[0]));

        // Check if all required fields are present in headers
        const hasAllRequiredFields = REQUIRED_FIELDS.every(field => foundFields.has(field));
        if (!hasAllRequiredFields) {
            throw new errors.ValidationError({
                message: 'Invalid CSV format: Missing required columns'
            });
        }
    } catch (error) {
        if (error instanceof errors.ValidationError) {
            throw error;
        }
        throw new errors.ValidationError({
            message: `Invalid CSV format: ${error.message}`
        });
    }
};

/**
 * Convert Bear blog post to Ghost format
 * @param {Object} post - Bear blog post data
 * @returns {Promise<Object>} - Ghost post format
 */
const processPost = async (post) => {
    try {
        // Convert markdown to HTML
        const html = md.render(post.content || '');

        // Convert HTML to Lexical
        const ctx = {
            logger: console,
            result: {
                posts: [{
                    title: post.title,
                    slug: post.slug,
                    html
                }]
            }
        };

        const tasks = mgHtmlLexical.convert(ctx, false);
        const taskRunner = makeTaskRunner(tasks, {
            renderer: 'silent'
        });
        await taskRunner.run();
        const lexical = ctx.result.posts[0].lexical;

        return {
            url: post.slug,
            data: {
                title: decode(post.title),
                slug: post.slug,
                status: post.publish ? 'published' : 'draft',
                created_at: post['first published at'] || post['published date'],
                published_at: post['published date'],
                custom_excerpt: post['meta description'] || '',
                feature_image: post['meta image'] || '',
                type: post['is page'] === 'True' ? 'page' : 'post',
                tags: parseTags(post['all tags']),
                lexical
            }
        };
    } catch (error) {
        throw new errors.InternalServerError({
            message: `Error processing post "${post.title}": ${error.message}`,
            context: error
        });
    }
};

/**
 * Process all posts from Bear export
 * @param {string} input - CSV content
 * @returns {Promise<Object>} - Ghost data
 */
const all = async (input) => {
    try {
        const posts = fsUtils.csv.parseString(input);

        validatePosts(posts);

        const processedPosts = await Promise.all(posts.map(post => processPost(post)));

        return {posts: processedPosts};
    } catch (error) {
        if (error instanceof errors.ValidationError || error instanceof errors.InternalServerError) {
            throw error;
        }

        throw new errors.InternalServerError({
            message: `Error processing CSV: ${error.message}`,
            context: error
        });
    }
};

export default {
    processPost,
    all,
    parseTags,
    validatePosts,
    validateCsvStructure
}; 