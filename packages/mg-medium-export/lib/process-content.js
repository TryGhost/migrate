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

    return $content.html().trim();
};
