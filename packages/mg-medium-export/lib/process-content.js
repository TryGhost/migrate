import $ from 'cheerio';

const equivalentTitles = (title1, title2) => {
    title1 = title1.replace(/[\s\n]/g, '');
    title2 = title2.replace(/[\s\n]/g, '');

    return title1 === title2;
};

export default ({content, post}) => {
    let $content = $(content);

    // Medium usually has an hr divider at the very beginning of the content
    // We don't need this so remove it if we find it
    let $firstSection = $content.find('.section--first');
    if ($firstSection.children().first().hasClass('section-divider')) {
        $firstSection.children().first().remove();
    }

    // Sometimes Medium has a duplicate header at the beginning of the content
    // Don't need this either so remove it
    let firstTitle = $content.find('h1, h2, h3, h4, blockquote').first();
    if (equivalentTitles(firstTitle.text(), post.data.title)) {
        $content.find(firstTitle).remove();
    }

    $content.find('blockquote.graf--pullquote, blockquote.graf--blockquote').each((i, bq) => {
        $(bq).removeAttr('name');
        $(bq).removeAttr('id');
        $(bq).removeAttr('class');

        $(bq).find('a').each((ii, a) => {
            $(a).removeAttr('data-href');
            $(a).removeAttr('class');
        });

        $(bq).html(`<p>${$(bq).html()}</p>`);
    });

    $content.find('pre.graf--pre').each((i, pre) => {
        $(pre).removeAttr('name');
        $(pre).removeAttr('id');
        $(pre).removeAttr('class');
        $(pre).removeAttr('data-code-block-mode');
        $(pre).removeAttr('spellcheck');
        $(pre).html($(pre).html().trim());

        const lang = $(pre).attr('data-code-block-lang');
        $(pre).removeAttr('data-code-block-lang');

        $(pre).find('span.pre--content').each((ii, span) => {
            span.name = 'code';
        });

        $(pre).find('code').each((iii, code) => {
            $(code).removeAttr('name');
            $(code).removeAttr('id');
            $(code).removeAttr('class');

            if (lang && lang.length > 0) {
                $(code).addClass(`language-${lang}`);
            }

            $(code).html($(code).html().replace(/<br>/g, ' \n').trim());
        });
    });

    return $content.html().trim();
};
