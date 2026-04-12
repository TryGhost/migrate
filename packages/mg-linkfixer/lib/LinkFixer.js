import {join} from 'node:path';
import {domUtils} from '@tryghost/mg-utils';

const {processFragment} = domUtils;

// @TODO: expand this list
const htmlFields = ['html'];
const lexicalFields = ['lexical'];

const isHTMLField = field => htmlFields.includes(field);
const isLexicalField = field => lexicalFields.includes(field);

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
    static cleanURL(url) {
        try {
            const urlParts = new URL(url);
            const cleanedURL = join(urlParts.host, urlParts.pathname);

            return cleanedURL;
        } catch (error) {
            // If it's an invalid URL, return the original string
            return url;
        }
    }

    // Instance method for backward compatibility
    cleanURL(url) {
        return LinkFixer.cleanURL(url);
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
            const siteURL = new URL(postURLDomain.origin);

            siteURL.protocol = 'http:';
            const siteURLHttp = siteURL.toString().replace(/\/$/, '');

            siteURL.protocol = 'https:';
            const siteURLHttps = siteURL.toString().replace(/\/$/, '');

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
            let updatedURL = LinkFixer.cleanURL(key);
            this.linkMap[updatedURL] = this.linkMap[key];
        });
    }

    /**
     * Cross-populate the linkMap so that every known path is accessible via every provided domain.
     * Call after buildMap() when the source site used multiple domains.
     * @param {String|String[]} urls One or more site URLs
     */
    expandForDomains(urls) {
        const siteURLs = [].concat(urls || []).filter(Boolean);
        if (siteURLs.length < 2) {
            return;
        }
        const hosts = siteURLs.map(u => new URL(u).host);
        const pathMap = {};
        for (const [key, value] of Object.entries(this.linkMap)) {
            for (const host of hosts) {
                if (key.startsWith(host + '/')) {
                    pathMap[key.slice(host.length)] = value;
                    break;
                }
            }
        }
        for (const [path, value] of Object.entries(pathMap)) {
            for (const host of hosts) {
                this.linkMap[host + path] = value;
            }
        }
    }

    async processHTML(html) {
        return processFragment(html, (parsed) => {
            for (const el of parsed.$('a')) {
                let href = el.getAttribute('href');

                if (!href) {
                    continue;
                }

                // Clean the URL, matching the links stored in the linkMap
                let updatedURL = LinkFixer.cleanURL(href);

                if (this.linkMap[updatedURL]) {
                    el.setAttribute('href', this.linkMap[updatedURL]);
                }
            }

            return parsed.html();
        });
    }

    async processLexical(lexical) {
        const parsedLexical = JSON.parse(lexical);

        const mappedObject = mapObject(parsedLexical, (key, value) => {
            if (key === 'url') {
                let updatedURL = LinkFixer.cleanURL(value);

                return this.linkMap[updatedURL] || value;
            } else {
                return value;
            }
        });

        return JSON.stringify(mappedObject);
    }

    /**
     * Fix links in a single post using a lookup function instead of the in-memory linkMap.
     * The post is duck-typed — it only needs get(field) and set(field, value) methods.
     * The lookupFn receives a cleaned URL (host/path, no protocol or query params) and
     * should return the new relative path, or null/undefined if no match.
     *
     * @param {Object} post Object with get(field) and set(field, value) methods
     * @param {Function} lookupFn (cleanedUrl: string) => string | null
     */
    async fixPost(post, lookupFn) {
        for (const field of htmlFields) {
            const value = post.get(field);
            if (!value) {
                continue;
            }

            const fixed = await processFragment(value, (parsed) => {
                for (const el of parsed.$('a')) {
                    const href = el.getAttribute('href');
                    if (!href) {
                        continue;
                    }

                    const cleanedURL = LinkFixer.cleanURL(href);
                    const newURL = lookupFn(cleanedURL);
                    if (newURL) {
                        el.setAttribute('href', newURL);
                    }
                }
                return parsed.html();
            });

            post.set(field, fixed);
        }

        for (const field of lexicalFields) {
            const value = post.get(field);
            if (!value) {
                continue;
            }

            const parsed = JSON.parse(value);
            const mapped = mapObject(parsed, (key, val) => {
                if (key === 'url') {
                    const cleanedURL = LinkFixer.cleanURL(val);
                    return lookupFn(cleanedURL) || val;
                }
                return val;
            });
            post.set(field, JSON.stringify(mapped));
        }
    }

    fix(ctx, task) {
        let tasks = [];
        let json = ctx.result;

        if (Object.keys(this.linkMap).length === 0) {
            task.skip('Link map not available');
            return;
        }

        // For each resource type e.g. posts, users
        for (const [type, resources] of Object.entries(json.data)) {
            // For each individual resource
            for (const resource of resources) {
                // For each field
                for (const [field, value] of Object.entries(resource)) {
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
                }
            }
        }

        return tasks;
    }
}
