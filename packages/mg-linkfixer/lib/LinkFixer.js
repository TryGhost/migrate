const _ = require('lodash');
const cheerio = require('cheerio');

// @TODO: expand this list
const htmlFields = ['html'];

const isHTMLField = field => _.includes(htmlFields, field);

class LinkFixer {
    constructor() {
        this.linkMap = {};
    }

    removeProtocol(url) {
        return url.replace(/^https?:\/\//, '');
    }

    buildMap(ctx) {
        if (!ctx.result.posts) {
            return;
        }

        // @TODO: support for custom taxonomies
        ctx.result.posts.forEach(({url, data}) => {
            const RegexYYYYMMDD = new RegExp(`^${ctx.options.url}/([0-9]{4}/[0-9]{2}/[0-9]{2})/([a-zA-Z0-9-_]*)(/)?`);
            const isYYYYMMDDDatedPermalink = url.match(RegexYYYYMMDD);

            const RegexYYYYMM = new RegExp(`^${ctx.options.url}/([0-9]{4}/[0-9]{2})/([a-zA-Z0-9-_]*)(/)?`);
            const isYYYYMMDatedPermalink = url.match(RegexYYYYMM);

            if (ctx.options.datedPermalinks === '/yyyy/mm/dd/' && isYYYYMMDDDatedPermalink) {
                this.linkMap[url] = `/${url.replace(RegexYYYYMMDD, '$1/$2')}/`;
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
            if (data.author) {
                this.linkMap[data.author.url] = `/author/${data.author.data.slug}/`;
            }
        });

        // Remove the protocol, ensuring we treat `http` and `https` sites in the same way
        Object.keys(this.linkMap).forEach((key) => {
            let noProtocolKey = this.removeProtocol(key);
            this.linkMap[noProtocolKey] = this.linkMap[key];
        });
    }

    async processHTML(html) {
        let $ = cheerio.load(html);

        let links = $('a').map(async (i, el) => {
            let href = $(el).attr('href');

            // Remove protocol, matching the protocol links stored in the linkMap
            let noProtocolHref = this.removeProtocol(href);

            if (this.linkMap[noProtocolHref]) {
                $(el).attr('href', this.linkMap[noProtocolHref]);
            }
        }).get();

        await Promise.all(links);
        return $.html();
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

module.exports = LinkFixer;
