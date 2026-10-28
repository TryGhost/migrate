import SimpleDom from 'simple-dom';
import {cardUtils} from '@tryghost/mg-utils';
import {TextNode} from './text.js';
import type {TinyNewsBlock, TinyNewsChild} from './types.js';

type Block = TinyNewsBlock;
type EmbedBlock = TinyNewsBlock & {link: string};

export interface JsonToHtmlOptions {
    /** Called with a reason for each block that cannot be converted. The block is left out of the HTML. */
    onUnhandled?: (reason: string, block: TinyNewsBlock) => void;
}

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);
const imageCard = cardUtils.getCard('image');

// From https://gist.github.com/takien/4077195
const getYouTubeID = (url: string): string => {
    const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

/** A run of text with its link and bold, italic and underline styles. */
const formatChildStyles = (child: TinyNewsChild): string => {
    const style = child.style ?? {};
    let html = child.content ?? '';

    if (style.underline) {
        html = `<u>${html}</u>`;
    }

    if (style.italic) {
        html = `<em>${html}</em>`;
    }

    if (style.bold) {
        html = `<strong>${html}</strong>`;
    }

    if (child.link) {
        html = `<a href="${child.link}">${html}</a>`;
    }

    return html;
};

const EntryList = (block: Block): string => {
    const listTypeEl = block.listType === 'NUMBER' ? 'ol' : 'ul';

    let html = [];

    html.push(`<${listTypeEl}>`);

    (block.items ?? []).forEach(item => {
        (item.children ?? []).forEach(child => {
            html.push(`<li>${formatChildStyles(child)}</li>`);
        });
    });

    html.push(`</${listTypeEl}>`);

    return html.join('');
};

const EntryText = (block: Block): string | null => {
    return TextNode({node: block});
};

const EntryImage = (block: Block): string => {
    let html: string[] = [];

    (block.children ?? []).forEach(child => {
        let cardOpts: {env: unknown; payload: Record<string, unknown>} = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: child.imageUrl,
                alt: child.imageAlt,
                caption: child.imageAlt
            }
        };

        if (block.link) {
            cardOpts.payload.href = block.link;
        }

        html.push(serializer.serialize(imageCard.render(cardOpts)));
    });

    return html.join('');
};

const EntryHeading = (block: Block): string | null => {
    return TextNode({node: block});
};

/** A block quote of the block's nonblank children, or nothing when every child is blank. */
const EntryBlockquote = (block: Block): string => {
    const children = (block.children ?? []).filter(child => child.content?.trim());
    if (!children.length) {
        return '';
    }

    return `<blockquote><p>${children.map(formatChildStyles).join('')}</p></blockquote>`;
};

const EntryHorizontalRule = (_block?: Block): string => '<hr>';

const EntryTwitterEmbed = (block: EmbedBlock): string => {
    const blockHtml = `<figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><a href="${block.link}"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure>`;

    return blockHtml;
};

const EntryTikTokEmbed = (block: EmbedBlock): string => {
    const usernameRegexp = new RegExp('(?<username>@[a-zA-Z0-9-_]+)');
    const usernameMatches = block.link.match(usernameRegexp);

    const videoIDRegexp = new RegExp('(?<videoID>[0-9]{10,})');
    const videoIDMatches = block.link.match(videoIDRegexp);

    if (usernameMatches && videoIDMatches) {
        const username = usernameMatches.groups!.username;
        const videoID = videoIDMatches.groups!.videoID;
        return `<figure class="kg-card kg-embed-card"><blockquote class="tiktok-embed" cite="https://www.tiktok.com/${username}/video/${videoID}" data-video-id="${videoID}" style="max-width: 605px;min-width: 325px;"><section><a target="_blank" title="${username}" href="https://www.tiktok.com/${username}?refer=embed">${username}</a></section></blockquote><script async src="https://www.tiktok.com/embed.js"></script></figure>`;
    } else {
        return `<p><a href="${block.link}">${block.link}</a></p>`;
    }
};

const EntryFacebookEmbed = (block: EmbedBlock): string => {
    if (block.html) {
        const blockHtml = `<!--kg-card-begin: html-->${block.html}<!--kg-card-end: html-->`;
        return blockHtml;
    } else {
        return `<p><a href="${block.link}">${block.link}</a></p>`;
    }
};

const EntryVimeoEmbed = (block: EmbedBlock): string => {
    const videoIDRegexp = new RegExp('(?<videoID>[0-9]{3,})');
    const videoIDMatches = block.link.match(videoIDRegexp);

    if (videoIDMatches) {
        const blockHtml = `<iframe src="https://player.vimeo.com/video/${videoIDMatches.groups!.videoID}" width="160" height="90" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;

        return blockHtml;
    } else {
        return `<p><a href="${block.link}">${block.link}</a></p>`;
    }
};

const EntryYoutubeEmbed = (block: EmbedBlock): string => {
    const videoID = getYouTubeID(block.link);

    const blockHtml = `<iframe width="160" height="90" src="https://www.youtube.com/embed/${videoID}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;

    return blockHtml;
};

const EntryApplePodcastsEmbed = (block: EmbedBlock): string => {
    const iframeSrc = block.link.replace('https://podcasts.apple.com', 'https://embed.podcasts.apple.com');
    const blockHtml = `<iframe allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" frameborder="0" height="450" style="width:100%;max-width:660px;overflow:hidden;border-radius:10px;" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="${iframeSrc}"></iframe>`;

    return blockHtml;
};

const EntryInstagramPostEmbed = (block: EmbedBlock): string => {
    const blockHtml = `<iframe src="${block.link}embed/captioned/" class="instagram-media" allowtransparency="true" allowfullscreen="true" frameborder="0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px; min-width: 326px; padding: 0px;"></iframe><script async="" src="//www.instagram.com/embed.js"></script>`;

    return blockHtml;
};

const EntryInstagramReelEmbed = (block: EmbedBlock): string => {
    const blockHtml = `<iframe class="instagram-media" src="${block.link}embed/captioned/" allowtransparency="true" allowfullscreen="true" frameborder="0" scrolling="no" style="background: white; max-width: 540px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px; min-width: 326px; padding: 0px; position: relative;"></iframe><script async="" src="//www.instagram.com/embed.js"></script>`;

    return blockHtml;
};

const EntryGoogleDocsEmbed = (block: EmbedBlock): string => {
    const blockHtml = `<iframe class="googledocs-embed" src="${block.link}" allowtransparency="true" allowfullscreen="true" frameborder="0" style="width: 100%; height: 500px;"></iframe>`;

    return blockHtml;
};

const EntrySpotifyEmbed = (block: EmbedBlock): string => {
    let embedUrl = block.link.replace('https://open.spotify.com/episode/', 'https://open.spotify.com/embed/episode/');
    embedUrl = embedUrl.replace('https://open.spotify.com/show/', 'https://open.spotify.com/embed/show/');
    const blockHtml = `<iframe src="${embedUrl}" width="300" height="380" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;

    return blockHtml;
};

const HEADING_STYLES = ['TITLE', 'SUBTITLE', 'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4'];

/** The embed for a link, by host and path, or `undefined` when the link is not a supported embed. */
const embedFor = (block: EmbedBlock): ((block: EmbedBlock) => string) | undefined => {
    const embedUrl = URL.parse(block.link);
    if (!embedUrl) {
        return undefined;
    }
    const {hostname: embedHost, pathname: embedPath} = embedUrl;

    if (embedHost === 'twitter.com') {
        return EntryTwitterEmbed;
    } else if (embedHost === 'www.tiktok.com') {
        return EntryTikTokEmbed;
    } else if (embedHost === 'www.facebook.com') {
        return EntryFacebookEmbed;
    } else if (embedHost === 'vimeo.com') {
        return EntryVimeoEmbed;
    } else if (embedHost === 'www.youtube.com' || embedHost === 'youtu.be') {
        return EntryYoutubeEmbed;
    } else if (embedHost === 'podcasts.apple.com') {
        return EntryApplePodcastsEmbed;
    } else if (
        embedHost === 'open.spotify.com' &&
        (embedPath.startsWith('/episode/') || embedPath.startsWith('/show/'))
    ) {
        return EntrySpotifyEmbed;
    } else if (embedHost === 'www.instagram.com' && embedPath.startsWith('/p/')) {
        return EntryInstagramPostEmbed;
    } else if (embedHost === 'www.instagram.com' && embedPath.startsWith('/reel/')) {
        return EntryInstagramReelEmbed;
    } else if (embedHost === 'docs.google.com') {
        return EntryGoogleDocsEmbed;
    }
    return undefined;
};

/**
 * Convert an article's content blocks to HTML. A string is already HTML and is returned as it is. Blocks that cannot
 * be converted are left out and passed to `onUnhandled`, as is a `mainImage` block: the feature image comes from the
 * article instead.
 */
const jsonToHtml = (
    blocks: TinyNewsBlock[] | string | null | undefined,
    {onUnhandled = () => {}}: JsonToHtmlOptions = {}
): string => {
    let html: (string | null)[] = [];

    if (typeof blocks === 'string') {
        return blocks;
    }

    (blocks ?? []).forEach(block => {
        const itemType = block.type ?? null;
        const itemStyle = block.style ?? null;

        if (itemType === 'mainImage') {
            // This element is skipped as we use the top level 'featured_image' instead
            // Using this would result in duplicates
            return;
        }

        if (itemType === 'text') {
            if (itemStyle && HEADING_STYLES.includes(itemStyle)) {
                html.push(EntryHeading(block));
            } else if (itemStyle === 'NORMAL_TEXT') {
                html.push(EntryText(block));
            } else {
                onUnhandled(`Unhandled text style: ${itemStyle}`, block);
            }
        } else if (itemType === 'blockquote') {
            html.push(EntryBlockquote(block));
        } else if (itemType === 'hr') {
            html.push(EntryHorizontalRule());
        } else if (itemType === 'list') {
            html.push(EntryList(block));
        } else if (itemType === 'image') {
            html.push(EntryImage(block));
        } else if (itemType === 'embed') {
            const embed = typeof block.link === 'string' ? embedFor(block as EmbedBlock) : undefined;
            if (embed) {
                html.push(embed(block as EmbedBlock));
            } else {
                onUnhandled(`Unhandled embed: ${block.link}`, block);
            }
        } else {
            onUnhandled(`Unhandled block type: ${itemType}`, block);
        }
    });

    return html.join('');
};

export {
    jsonToHtml,
    formatChildStyles,
    EntryList,
    EntryText,
    EntryImage,
    EntryHeading,
    EntryBlockquote,
    EntryHorizontalRule,
    EntryTwitterEmbed,
    EntryTikTokEmbed,
    EntryFacebookEmbed,
    EntryVimeoEmbed,
    EntryYoutubeEmbed,
    EntryApplePodcastsEmbed,
    EntryInstagramPostEmbed,
    EntryInstagramReelEmbed,
    EntryGoogleDocsEmbed,
    EntrySpotifyEmbed
};
