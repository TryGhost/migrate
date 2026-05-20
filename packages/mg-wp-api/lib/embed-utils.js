const EMBED_SERVICES = [
    {
        name: 'youtube',
        patterns: [
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([\w-]+)/i,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]+)/i,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([\w-]+)/i,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([\w-]+)/i,
            /(?:https?:\/\/)?youtu\.be\/([\w-]+)/i,
            /(?:https?:\/\/)?(?:www\.)?youtube-nocookie\.com\/embed\/([\w-]+)/i
        ],
        buildEmbedHtml(id) {
            return `<figure class="kg-card kg-embed-card"><iframe src="https://www.youtube.com/embed/${id}?feature=oembed" width="160" height="90" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></figure>`;
        },
        extractId(url) {
            for (const pattern of this.patterns) {
                const match = url.match(pattern);
                if (match && match[1]) {
                    return match[1];
                }
            }
            return null;
        }
    },
    {
        name: 'vimeo',
        patterns: [
            /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/i,
            /(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/i
        ],
        buildEmbedHtml(id) {
            return `<figure class="kg-card kg-embed-card"><iframe src="https://player.vimeo.com/video/${id}" width="160" height="90" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></figure>`;
        }
    },
    {
        name: 'spotify',
        patterns: [
            /(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode|show)\/([\w]+)/i,
            /(?:https?:\/\/)?open\.spotify\.com\/embed\/(track|album|playlist|episode|show)\/([\w]+)/i
        ],
        buildEmbedHtml(id, groups) {
            const type = groups[0];
            const trackId = groups[1];
            return `<figure class="kg-card kg-embed-card"><iframe src="https://open.spotify.com/embed/${type}/${trackId}" width="100%" height="352" frameborder="0" allow="encrypted-media" allowfullscreen></iframe></figure>`;
        },
        extractId(url) {
            for (const pattern of this.patterns) {
                const match = url.match(pattern);
                if (match) {
                    return {id: match[2], groups: [match[1], match[2]]};
                }
            }
            return null;
        }
    },
    {
        name: 'dailymotion',
        patterns: [
            /(?:https?:\/\/)?(?:www\.)?dailymotion\.com\/video\/([\w]+)/i,
            /(?:https?:\/\/)?(?:www\.)?dailymotion\.com\/embed\/video\/([\w]+)/i,
            /(?:https?:\/\/)?dai\.ly\/([\w]+)/i
        ],
        buildEmbedHtml(id) {
            return `<figure class="kg-card kg-embed-card"><iframe src="https://www.dailymotion.com/embed/video/${id}" width="160" height="90" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></figure>`;
        }
    },
    {
        name: 'soundcloud',
        patterns: [
            /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/([\w-]+)\/([\w-]+)/i,
            /(?:https?:\/\/)?w\.soundcloud\.com\/player\/\?url=/i
        ],
        buildEmbedHtml(_id, _groups, originalUrl) {
            return `<figure class="kg-card kg-embed-card"><iframe src="${originalUrl}" width="100%" height="166" frameborder="0" allow="autoplay"></iframe></figure>`;
        },
        extractId(url) {
            for (const pattern of this.patterns) {
                const match = url.match(pattern);
                if (match) {
                    return {id: match[1] || 'soundcloud', groups: match.slice(1)};
                }
            }
            return null;
        }
    },
    {
        name: 'twitter',
        patterns: [
            /(?:https?:\/\/)?(?:www\.)?twitter\.com\/\w+\/status\/(\d+)/i,
            /(?:https?:\/\/)?(?:www\.)?x\.com\/\w+\/status\/(\d+)/i
        ],
        buildEmbedHtml(_id, _groups, originalUrl) {
            return `<!--kg-card-begin: embed--><figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><a href="${originalUrl}"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure><!--kg-card-end: embed-->`;
        }
    },
    {
        name: 'instagram',
        patterns: [
            /(?:https?:\/\/)?(?:www\.)?instagram\.com\/p\/([\w-]+)/i,
            /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([\w-]+)/i
        ],
        buildEmbedHtml(_id, _groups, originalUrl) {
            return `<figure class="kg-card kg-embed-card"><blockquote class="instagram-media" data-instgrm-permalink="${originalUrl}"><a href="${originalUrl}"></a></blockquote><script async src="//www.instagram.com/embed.js"></script></figure>`;
        }
    },
    {
        name: 'bluesky',
        patterns: [
            /(?:https?:\/\/)?bsky\.app\/profile\/[\w.:-]+\/post\/([\w]+)/i
        ],
        buildEmbedHtml(_id, _groups, originalUrl) {
            return `<figure class="kg-card kg-embed-card"><blockquote><a href="${originalUrl}"></a></blockquote></figure>`;
        }
    },
    {
        name: 'tiktok',
        patterns: [
            /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i
        ],
        buildEmbedHtml(_id, _groups, originalUrl) {
            return `<figure class="kg-card kg-embed-card"><blockquote><a href="${originalUrl}"></a></blockquote></figure>`;
        }
    }
];

/**
 * Test a URL string against all known embed service patterns.
 * Returns {service, id, groups, url} on match, or null.
 */
const matchEmbedUrl = (url) => {
    if (!url || typeof url !== 'string') {
        return null;
    }

    const trimmed = url.trim();
    if (!trimmed) {
        return null;
    }

    for (const service of EMBED_SERVICES) {
        if (service.extractId) {
            const result = service.extractId(trimmed);
            if (result) {
                const id = typeof result === 'string' ? result : result.id;
                const groups = typeof result === 'string' ? [result] : result.groups;
                if (id) {
                    return {service: service.name, id, groups, url: trimmed, buildEmbedHtml: service.buildEmbedHtml.bind(service)};
                }
            }
        } else {
            for (const pattern of service.patterns) {
                const match = trimmed.match(pattern);
                if (match && match[1]) {
                    return {service: service.name, id: match[1], groups: match.slice(1), url: trimmed, buildEmbedHtml: service.buildEmbedHtml.bind(service)};
                }
            }
        }
    }

    return null;
};

/**
 * Given a match result from matchEmbedUrl, produce the Ghost embed HTML.
 */
const buildEmbedHtml = (match) => {
    if (!match) {
        return null;
    }
    return match.buildEmbedHtml(match.id, match.groups, match.url);
};

export {EMBED_SERVICES, matchEmbedUrl, buildEmbedHtml};
