import SimpleDom from 'simple-dom';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';
import {TextNode} from './text.js';

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

// From https://gist.github.com/takien/4077195
const getYouTubeID = (url) => {
    const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

const formatChildStyles = (child) => {
    let html = [];

    if (child?.link) {
        html.push(`<a href="${child.link}">`);
    }

    if (child?.style?.bold) {
        html.push('<strong>');
    }

    if (child?.style?.italic) {
        html.push('<em>');
    }

    if (child?.style?.underline) {
        html.push('<u>');
    }

    html.push(child.content);

    if (child?.style?.underline) {
        html.push('</u>');
    }

    if (child?.style?.italic) {
        html.push('</em>');
    }

    if (child?.style?.bold) {
        html.push('</strong>');
    }

    if (child?.link) {
        html.push(`</a>`);
    }

    return html.join('');
};

const EntryList = (block) => {
    const listTypeEl = (block.listType === 'NUMBER') ? 'ol' : 'ul';

    let html = [];

    html.push(`<${listTypeEl}>`);

    block.items.forEach((item) => {
        item.children.forEach((child) => {
            html.push(`<li>${formatChildStyles(child)}</li>`);
        });
    });

    html.push(`</${listTypeEl}>`);

    return html.join('');
};

const EntryText = (block) => {
    return TextNode({node: block});
};

const EntryImage = (block) => {
    if (block.children.length === 0) {
        return;
    }

    let html = [];

    block.children.forEach((child) => {
        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: child.imageUrl,
                alt: child.imageAlt,
                caption: child.imageAlt
            }
        };

        if (block?.link) {
            cardOpts.payload.href = block.link;
        }

        html.push(serializer.serialize(imageCard.render(cardOpts)));
    });

    return html.join('');
};

const EntryHeading = (block) => {
    return TextNode({node: block});
};

const EntryBlockquote = (block) => {
    if (block.children[0].content.trim() === '') {
        return;
    }

    let html = [];

    html.push('<blockquote><p>');

    block.children.forEach((child) => {
        if (child.content.trim() === '') {
            return;
        }

        html.push(formatChildStyles(child));
    });

    html.push('</p></blockquote>');

    return html.join('');
};

const EntryHorizontalRule = () => {
    let html = [];
    html.push('<hr>');
    return html.join('');
};

const EntryTwitterEmbed = (block) => {
    const blockHtml = `<figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><a href="${block.link}"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure>`;

    return blockHtml;
};

const EntryTikTokEmbed = (block) => {
    const usernameRegexp = new RegExp('(?<username>@[a-zA-Z0-9-_]+)');
    const usernameMatches = block.link.match(usernameRegexp);

    const videoIDRegexp = new RegExp('(?<videoID>[0-9]{10,})');
    const videoIDMatches = block.link.match(videoIDRegexp);

    if (usernameMatches?.groups?.username && videoIDMatches?.groups?.videoID) {
        return `<figure class="kg-card kg-embed-card"><blockquote class="tiktok-embed" cite="https://www.tiktok.com/${usernameMatches.groups.username}/video/${videoIDMatches.groups.videoID}" data-video-id="${videoIDMatches.groups.videoID}" style="max-width: 605px;min-width: 325px;"><section><a target="_blank" title="${usernameMatches.groups.username}" href="https://www.tiktok.com/${usernameMatches.groups.username}?refer=embed">${usernameMatches.groups.username}</a></section></blockquote><script async src="https://www.tiktok.com/embed.js"></script></figure>`;
    } else {
        return `<p><a href="${block.link}">${block.link}</a></p>`;
    }
};

const EntryFacebookEmbed = (block) => {
    if (block?.html) {
        const blockHtml = `<!--kg-card-begin: html-->${block.html}<!--kg-card-end: html-->`;
        return blockHtml;
    } else {
        return `<p><a href="${block.link}">${block.link}</a></p>`;
    }
};

const EntryVimeoEmbed = (block) => {
    const videoIDRegexp = new RegExp('(?<videoID>[0-9]{3,})');
    const videoIDMatches = block.link.match(videoIDRegexp);

    if (videoIDMatches?.groups?.videoID) {
        const blockHtml = `<iframe src="https://player.vimeo.com/video/${videoIDMatches.groups.videoID}" width="160" height="90" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;

        return blockHtml;
    } else {
        return `<p><a href="${block.link}">${block.link}</a></p>`;
    }
};

const EntryYoutubeEmbed = (block) => {
    const videoID = getYouTubeID(block.link);

    const blockHtml = `<iframe width="160" height="90" src="https://www.youtube.com/embed/${videoID}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;

    return blockHtml;
};

const EntryApplePodcastsEmbed = (block) => {
    const iframeSrc = block.link.replace('https://podcasts.apple.com', 'https://embed.podcasts.apple.com');
    const blockHtml = `<iframe allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" frameborder="0" height="450" style="width:100%;max-width:660px;overflow:hidden;border-radius:10px;" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="${iframeSrc}"></iframe>`;

    return blockHtml;
};

const EntryInstagramPostEmbed = (block) => {
    const blockHtml = `<iframe src="${block.link}embed/captioned/" class="instagram-media" allowtransparency="true" allowfullscreen="true" frameborder="0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px; min-width: 326px; padding: 0px;"></iframe><script async="" src="//www.instagram.com/embed.js"></script>`;

    return blockHtml;
};

const EntryInstagramReelEmbed = (block) => {
    const blockHtml = `<iframe class="instagram-media" src="${block.link}embed/captioned/" allowtransparency="true" allowfullscreen="true" frameborder="0" scrolling="no" style="background: white; max-width: 540px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px; min-width: 326px; padding: 0px; position: relative;"></iframe><script async="" src="//www.instagram.com/embed.js"></script>`;

    return blockHtml;
};

const EntryGoogleDocsEmbed = (block) => {
    const blockHtml = `<iframe class="googledocs-embed" src="${block.link}" allowtransparency="true" allowfullscreen="true" frameborder="0" style="width: 100%; height: 500px;"></iframe>`;

    return blockHtml;
};

const EntrySpotifyEmbed = (block) => {
    let embedUrl = block.link.replace('https://open.spotify.com/episode/', 'https://open.spotify.com/embed/episode/');
    embedUrl = embedUrl.replace('https://open.spotify.com/show/', 'https://open.spotify.com/embed/show/');
    const blockHtml = `<iframe src="${embedUrl}" width="300" height="380" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;

    return blockHtml;
};

const jsonToHtml = (blocks) => {
    let html = [];

    if (typeof blocks === 'string') {
        return blocks;
    }

    blocks.forEach((block) => {
        const itemType = block.type ?? null;
        const itemStyle = block.style ?? null;

        if (itemType === 'mainImage') {
            // This element is skipped as we use the top level 'featured_image' instead
            // Using this would result in duplicates
            return;
        }

        if (itemType === 'text') {
            if (itemStyle === 'TITLE' || itemStyle === 'SUBTITLE' || itemStyle === 'HEADING_1' || itemStyle === 'HEADING_2' || itemStyle === 'HEADING_3' || itemStyle === 'HEADING_4') {
                html.push(EntryHeading(block));
            } else if (itemStyle === 'NORMAL_TEXT') {
                html.push(EntryText(block));
            } else {
                // eslint-disable-next-line no-console
                console.error(`Unhandled text type: ${itemType} - Unhandled style: ${itemStyle}`, {
                    context: block
                });
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
            if (block.link.includes('https://twitter.com')) {
                html.push(EntryTwitterEmbed(block));
            } else if (block.link.includes('https://www.tiktok.com')) {
                html.push(EntryTikTokEmbed(block));
            } else if (block.link.includes('https://www.facebook.com')) {
                html.push(EntryFacebookEmbed(block));
            } else if (block.link.includes('https://vimeo.com')) {
                html.push(EntryVimeoEmbed(block));
            } else if (block.link.includes('https://www.youtube.com') || block.link.includes('https://youtu.be')) {
                html.push(EntryYoutubeEmbed(block));
            } else if (block.link.includes('https://podcasts.apple.com')) {
                html.push(EntryApplePodcastsEmbed(block));
            } else if (block.link.includes('https://open.spotify.com/episode/') || block.link.includes('https://open.spotify.com/show/')) {
                html.push(EntrySpotifyEmbed(block));
            } else if (block.link.includes('https://www.instagram.com/p/')) {
                html.push(EntryInstagramPostEmbed(block));
            } else if (block.link.includes('https://www.instagram.com/reel/')) {
                html.push(EntryInstagramReelEmbed(block));
            } else if (block.link.includes('https://docs.google.com')) {
                html.push(EntryGoogleDocsEmbed(block));
            } else {
                // eslint-disable-next-line no-console
                console.error(`Unhandled embed: ${block.link}`, {
                    context: block
                });
            }
        } else {
            // eslint-disable-next-line no-console
            console.error(`Unhandled type: ${itemType} - Unhandled style: ${itemStyle}`, {
                context: block
            });
        }
    });

    return html.join('');
};

export {
    jsonToHtml,
    getYouTubeID,
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
    EntryGoogleDocsEmbed
};
