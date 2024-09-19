import {join} from 'node:path';
import _ from 'lodash';
import cheerio from 'cheerio';

// @TODO: expand this list
const htmlFields = ['html'];
const lexicalFields = ['lexical'];

const isHTMLField = field => _.includes(htmlFields, field);
const isLexicalField = field => _.includes(lexicalFields, field);

function mapObject(obj, fn) {
    return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => {
            if (typeof value === 'object' &&
                value !== null) {
                return [key, mapObject(value, fn)];
            }
            return [key, fn(key, value)];
        })
    );
}

export default class LinkFixer {
    constructor() {
        this.linkMap = {};
    }

    /**
     * Clean the URL
     * @param {String} url The given URL
     * @returns {String} A cleaned URL with no protocol or parameters
     *
     * @example
     * cleanURL('https://exampleurl.com/sample-page/child-sample-page/?dolor=simet');
     * => exampleurl.com/sample-page/child-sample-page/
     *
     * @example
     * cleanURL('https://exampleurl.com/sample-page/');
     * => exampleurl.com/sample-page/
     */
    cleanURL(url) {
        try {
            const urlParts = new URL(url);
            const cleanedURL = join(urlParts.host, urlParts.pathname);

            return cleanedURL;
        } catch (error) {
            // If it's an invalid URL, return the original string
            return url;
        }
    }

    buildMap(ctx) {
        if (!ctx?.result?.posts && !ctx?.data?.posts) {
            return;
        }

        const theDataToParse = ctx?.result?.posts ?? ctx?.data?.posts;

        // @TODO: support for custom taxonomies
        theDataToParse.forEach(({url, data}) => {
            // Exit if no url or is empty string
            if (!url || url.length === 0) {
                return;
            }

            // Parse the current post URL, so we can use its domain as a fallback
            const postURLDomain = new URL(url);

            // We need to handle the domain with http: and https:, so build part of the regexp pattern that accounts for both
            const siteURL = new URL(ctx.options.url || postURLDomain.origin);

            siteURL.protocol = 'http:';
            const siteURLHttp = siteURL.toString().replace(/\/$/, ''); // Trim trailing slashes

            siteURL.protocol = 'https:';
            const siteURLHttps = siteURL.toString().replace(/\/$/, ''); // Trim trailing slashes

            const siteURLBothProtocols = `(?:${siteURLHttp}|${siteURLHttps})`;

            const RegexSlugYYYYMMDD = new RegExp(`^${siteURLBothProtocols}/[a-zA-Z0-9-]+/([0-9]{4}/[0-9]{2}/[0-9]{2})/([a-zA-Z0-9-_]*)(/)?`);
            const isSlugYYYYMMDDDatedPermalink = url.match(RegexSlugYYYYMMDD);

            const RegexYYYYMMDD = new RegExp(`^${siteURLBothProtocols}/([0-9]{4}/[0-9]{2}/[0-9]{2})/([a-zA-Z0-9-_]*)(/)?`);
            const isYYYYMMDDDatedPermalink = url.match(RegexYYYYMMDD);

            const RegexSlugYYYYMM = new RegExp(`^${siteURLBothProtocols}/[a-zA-Z0-9-]+/([0-9]{4}/[0-9]{2})/([a-zA-Z0-9-_]*)(/)?`);
            const isSlugYYYYMMDatedPermalink = url.match(RegexSlugYYYYMM);

            const RegexYYYYMM = new RegExp(`^${siteURLBothProtocols}/([0-9]{4}/[0-9]{2})/([a-zA-Z0-9-_]*)(/)?`);
            const isYYYYMMDatedPermalink = url.match(RegexYYYYMM);

            if (ctx.options.datedPermalinks === '/yyyy/mm/dd/' && isYYYYMMDDDatedPermalink) {
                this.linkMap[url] = `/${url.replace(RegexYYYYMMDD, '$1/$2')}/`;
            } else if (ctx.options.datedPermalinks === '/*/yyyy/mm/dd/' && isSlugYYYYMMDDDatedPermalink) {
                this.linkMap[url] = `/${url.replace(RegexSlugYYYYMMDD, '$1/$2')}/`;
            } else if (ctx.options.datedPermalinks === '/*/yyyy/mm/' && isSlugYYYYMMDatedPermalink) {
                this.linkMap[url] = `/${url.replace(RegexSlugYYYYMM, '$1/$2')}/`;
            } else if (ctx.options.datedPermalinks === '/yyyy/mm/' && isYYYYMMDatedPermalink) {
                this.linkMap[url] = `/${url.replace(RegexYYYYMM, '$1/$2')}/`;
            } else {
                this.linkMap[url] = `/${data.slug}/`;
            }

            if (data.tags) {
                data.tags.forEach(({url: tagUrl, data: tagData}) => {
                    this.linkMap[tagUrl] = `/tag/${tagData.slug}/`;
                });
            }

            if (data.authors) {
                data.authors.forEach((author) => {
                    this.linkMap[author.url] = `/author/${author.data.slug}/`;
                });
            }

            if (data.author) {
                this.linkMap[data.author.url] = `/author/${data.author.data.slug}/`;
            }
        });

        // Remove the protocol, ensuring we treat `http` and `https` sites in the same way
        Object.keys(this.linkMap).forEach((key) => {
            let updatedURL = this.cleanURL(key);
            this.linkMap[updatedURL] = this.linkMap[key];
        });
    }

    async processHTML(html) {
        let $ = cheerio.load(html, {
            decodeEntities: false,
            scriptingEnabled: false
        }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

        let links = $('a').map(async (i, el) => {
            let href = $(el).attr('href');

            if (!href) {
                return;
            }

            // Clean the URL, matching the links stored in the linkMap
            let updatedURL = this.cleanURL(href);

            if (this.linkMap[updatedURL]) {
                $(el).attr('href', this.linkMap[updatedURL]);
            }
        }).get();

        await Promise.all(links);
        return $.html();
    }

    async processLexical(lexical) {
        const parsedLexical = JSON.parse(lexical);

        const mappedObject = mapObject(parsedLexical, (key, value) => {
            if (key === 'url') {
                let updatedURL = this.cleanURL(value);

                return this.linkMap[updatedURL];
            } else {
                return value;
            }
        });

        return JSON.stringify(mappedObject);
    }

    fix(ctx, task) {
        let tasks = [];
        let json = ctx.result;

        if (_.size(this.linkMap) === 0) {
            task.skip('Link map not available');
            return;
        }

        // For each resource type e.g. posts, users
        _.forEach(json.data, (resources, type) => {
            // For each individual resource
            _.forEach(resources, (resource) => {
                // For each field
                _.forEach(resource, (value, field) => {
                    if (isLexicalField(field)) {
                        tasks.push({
                            title: `${type}: ${resource.slug} ${field}`,
                            task: async () => {
                                try {
                                    resource[field] = await this.processLexical(value);
                                } catch (error) {
                                    ctx.errors.push(error);
                                    throw error;
                                }
                            }
                        });
                    }
                    if (isHTMLField(field)) {
                        tasks.push({
                            title: `${type}: ${resource.slug} ${field}`,
                            task: async () => {
                                try {
                                    resource[field] = await this.processHTML(value);
                                } catch (error) {
                                    ctx.errors.push(error);
                                    throw error;
                                }
                            }
                        });
                    }
                });
            });
        });

        return tasks;
    }
}
