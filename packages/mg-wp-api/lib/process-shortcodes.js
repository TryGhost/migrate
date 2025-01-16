import $ from 'cheerio';
import Shortcodes from '@tryghost/mg-shortcodes';

const processShortcodes = async ({html}) => {
    const shortcodes = new Shortcodes();

    shortcodes.add('vc_btn', ({attrs}) => {
        let buttonHref = attrs?.link ?? false;

        if (!buttonHref) {
            return;
        }

        // Sometimes URLs have a `url:` prefix which we don't want
        if (buttonHref.startsWith('url:')) {
            buttonHref = buttonHref.slice(4);
        }

        buttonHref = decodeURIComponent(buttonHref);

        return `<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="${buttonHref}">${attrs.title}</a></div></div>`;
    });

    shortcodes.add('vc_cta', ({attrs}) => {
        let buttonHref = attrs?.btn_link ?? false;

        if (!buttonHref) {
            return;
        }

        // Sometimes URLs have a `url:` prefix which we don't want
        if (buttonHref.startsWith('url:')) {
            buttonHref = buttonHref.slice(4);
        }

        buttonHref = decodeURIComponent(buttonHref);

        return `<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="${buttonHref}">${attrs.btn_title}</a></div></div>`;
    });

    shortcodes.add('caption', ({content}) => {
        const $html = $.load(content, {
            decodeEntities: false,
            scriptingEnabled: false
        }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

        let theImage = $html('img');
        let theCaption = $html.text().trim();

        let $figure = $('<figure class="wp-block-image"></figure>');

        $figure.append(theImage);

        if (theCaption && theCaption.length) {
            $figure.append(`<figcaption>${theCaption.trim()}</figcaption>`);
        }

        return $.html($figure);
    });

    shortcodes.add('vc_separator', () => {
        return '<hr>';
    });

    shortcodes.add('gravityform', () => {
        return '';
    });

    shortcodes.add('et_pb_text', ({content}) => {
        // CASE: Divi Blog Extras uses these shortcodes for settings with text wrapped in `@ET-DC@..==@`, which should be removed if found
        // Else return the contents
        if (/^@ET-DC@.*==@$/.exec(content)) {
            return ' ';
        } else {
            return content;
        }
    });

    shortcodes.add('advanced_iframe', ({attrs}) => {
        return `<iframe src="${attrs.src}" height="${attrs.height}" style="border:0; width: 100%;" loading="lazy"></iframe>`;
    });

    shortcodes.add('sourcecode', ({attrs, content}) => {
        let captionString = (attrs?.title) ? `<figcaption>${attrs.title}</figcaption>` : '';
        let classString = (attrs?.language) ? `language-${attrs.language}` : '';
        let theContent = content.trim();
        return `<figure><pre class="${classString}"><code>${theContent}</code></pre>${captionString}</figure>`;
    });

    shortcodes.add('audio', ({attrs}) => {
        const sourceSrc = attrs?.src ?? null;
        const sourceMp3 = attrs?.mp3 ?? null;
        const sourceM4a = attrs?.m4a ?? null;
        const sourceOgg = attrs?.ogg ?? null;
        const sourceWav = attrs?.wav ?? null;
        const sourceWma = attrs?.wma ?? null;

        const firstAudioSrc = sourceSrc || sourceMp3 || sourceM4a || sourceOgg || sourceWav || sourceWma;

        if (firstAudioSrc) {
            return `<!--kg-card-begin: html--><audio controls src="${firstAudioSrc}" preload="metadata"></audio><!--kg-card-end: html-->`;
        }
    });

    shortcodes.add('code', ({attrs, content}) => {
        let captionString = (attrs?.title) ? `<figcaption>${attrs.title}</figcaption>` : '';
        let classString = (attrs?.language) ? `language-${attrs.language}` : '';
        let theContent = content.trim();
        return `<figure><pre class="${classString}"><code>${theContent}</code></pre>${captionString}</figure>`;
    });

    shortcodes.add('vc_custom_heading', ({attrs}) => {
        if (attrs?.font_container?.includes('tag:h1')) {
            return `<h1>${attrs.text}</h1>`;
        } else if (attrs?.font_container?.includes('tag:h2')) {
            return `<h2>${attrs.text}</h2>`;
        } else if (attrs?.font_container?.includes('tag:h3')) {
            return `<h3>${attrs.text}</h3>`;
        }
    });

    shortcodes.add('vc_empty_space', () => {
        return `<br></br>`;
    });

    // We don't want to change these, but only retain what's inside.
    shortcodes.unwrap('row');
    shortcodes.unwrap('column');
    shortcodes.unwrap('vc_row');
    shortcodes.unwrap('vc_row_inner');
    shortcodes.unwrap('vc_column');
    shortcodes.unwrap('vc_column_inner');
    shortcodes.unwrap('vc_column_text');
    shortcodes.unwrap('vc_basic_grid');
    shortcodes.unwrap('et_pb_code_builder_version');
    shortcodes.unwrap('et_pb_section');
    shortcodes.unwrap('et_pb_column');
    shortcodes.unwrap('et_pb_row');

    return shortcodes.parse(html);
};

export {
    processShortcodes
};
