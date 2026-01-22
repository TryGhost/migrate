import {readFile} from 'node:fs/promises';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';
import {slugify} from '@tryghost/string';
import {_base as debugFactory} from '@tryghost/debug';
import {jsonToHtml} from './json-to-html.js';

const debug = debugFactory('migrate:tinynews:lib:mapper');

const textOnly = (htmlContent) => {
    const cleanedContent = sanitizeHtml(htmlContent, {
        allowedTags: [],
        allowedAttributes: {}
    });
    return cleanedContent.trim();
};

const processAuthor = (author, authorsData) => {
    const name = [author.first_names, author.last_name].join(' ').trim();
    const slug = slugify(name);
    const email = (author?.email && author.email.length > 0) ? author.email : `${slug}@example.com`;

    let authorObject = {
        url: `/author/${slug}`,
        data: {
            slug: slug,
            name: name,
            email: email
        }
    };

    if (author?.photoUrl) {
        authorObject.data.profile_image = author.photoUrl;
    }

    if (author?.translations?.length && author.translations[0].bio) {
        authorObject.data.bio = textOnly(author.translations[0].bio);
    }

    // If we have a global authorsData object
    if (authorsData?.data) {
        // Find th author by first & last name
        const thisAuthorInfo = authorsData.data.authors.find((filterAuthor) => {
            return filterAuthor.first_names === author.first_names && filterAuthor.last_name === author.last_name;
        });

        // Update values from the globally supplied authorsData to the individual author object
        if (thisAuthorInfo) {
            authorObject.data.email = thisAuthorInfo.email;
            authorObject.data.bio = textOnly(thisAuthorInfo.translations[0].bio);
            authorObject.data.profile_image = thisAuthorInfo.photoUrl;
        }
    }

    return authorObject;
};

const mapPostPageConfig = (args) => {
    const {postData, authorsData, postType} = args;

    debug(`Mapping data for ${postData.slug}`);

    const dateNow = new Date().toISOString();

    const mappedData = {
        url: postData.live_url,
        data: {
            slug: postData.slug,
            published_at: postData.translations[0].first_published_at ?? dateNow,
            updated_at: postData.translations[0].last_published_at ?? dateNow,
            created_at: postData.translations[0].first_published_at ?? dateNow,
            title: postData.translations[0].headline,
            type: (postType === 'page') ? 'page' : 'post',
            html: null,
            status: postData.translations[0].published ? 'published' : 'draft',
            og_title: postData.translations[0].facebook_title ?? null,
            og_description: postData.translations[0].facebook_description ?? null,
            twitter_title: postData.translations[0].twitter_title ?? null,
            twitter_description: postData.translations[0].twitter_description ?? null,
            meta_title: postData.translations[0].search_title ?? null,
            meta_description: postData.translations[0].search_description ?? null,
            custom_excerpt: postData.translations[0].search_description ?? null,
            visibility: 'public',
            tags: []
        }
    };

    if (postType !== 'newsletter' && postData.translations[0].content) {
        mappedData.data.html = jsonToHtml(postData.translations[0].content);
    }

    if (mappedData.data.html.includes('class="fb-post')) {
        mappedData.data.codeinjection_head = '<div id="fb-root"></div><script async defer src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v3.2"></script>';
    }

    if (postData?.translations[0].main_image?.children && postData?.translations[0].main_image?.children[0]?.imageUrl) {
        mappedData.data.feature_image = postData.translations[0].main_image.children[0].imageUrl;
        mappedData.data.feature_image_alt = postData.translations[0].main_image.children[0]?.imageAlt ?? null;
        mappedData.data.feature_image_caption = postData.translations[0].main_image.children[0]?.imageAlt ?? null;
    }

    // Handle mainImage from pages (its in the content object)
    if (postType === 'page' && typeof postData.translations[0].content === 'object') {
        const hasMainImageInContent = postData.translations[0].content.find((block) => {
            return block.type === 'mainImage';
        });
        if (hasMainImageInContent?.children[0]?.imageUrl) {
            mappedData.data.feature_image = hasMainImageInContent.children[0].imageUrl;
        }
    }

    if (postData.author && postData.author.length) {
        mappedData.data.author = processAuthor(postData.author[0].author, authorsData);
    } else if (postData.translations[0].created_by_email) {
        const authorEmailName = postData.translations[0].created_by_email.split('@')[0];
        mappedData.data.author = {
            url: `/author/${authorEmailName}`,
            data: {
                slug: authorEmailName,
                name: authorEmailName,
                email: postData.translations[0].created_by_email
            }
        };
    } else if (authorsData?.data?.authors?.length === 1) {
        mappedData.data.author = processAuthor(authorsData.data.authors[0]);
    } else {
        mappedData.data.author = {
            url: `/author/author`,
            data: {
                slug: `author`,
                name: 'Author',
                email: 'author@example.com'
            }
        };
    }

    if (postData.category) {
        const categoryPublished = postData.category.published;
        let categoryName = postData.category.title ?? postData.category.slug;
        let categorySlug = postData.category.slug;

        if (categoryPublished && categoryPublished === false) {
            categoryName = `#${categoryName}`;
            categorySlug = `hash-${categorySlug}`;
        }

        mappedData.data.tags.push({
            url: `/tag/${categorySlug}`,
            data: {
                slug: categorySlug,
                name: categoryName
            }
        });
    }

    if (postData.tags) {
        postData.tags.forEach((tag) => {
            const tagData = tag.tag;
            const tagPublished = tagData.published;
            let tagName = tagData.tag_translations[0].title;
            let tagSlug = tagData.slug;

            if (tagPublished && tagPublished === false) {
                tagName = `#${tagName}`;
                tagSlug = `hash-${tagSlug}`;
            }

            mappedData.data.tags.push({
                url: `/tag/${tagSlug}`,
                data: {
                    slug: tagSlug,
                    name: tagName
                }
            });
        });
    }

    mappedData.data.tags.push({
        url: `migrator-added-tag`,
        data: {
            slug: `hash-tinynews`,
            name: `#tinynews`
        }
    });

    return mappedData;
};

const processNewsletterContent = (html, options) => { // eslint-disable-line no-unused-vars
    const cleanedContent = sanitizeHtml(html, {
        allowedTags: [
            'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote',
            'figure', 'figcaption', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'div'
        ],
        allowedAttributes: {
            a: ['href', 'title', 'rel', 'target'],
            img: ['src', 'alt', 'title']
        },
        transformTags: {
            'div': 'p' // eslint-disable-line quote-props
        }
    });

    const $html = cheerio.load(cleanedContent, {
        xml: {
            decodeEntities: false
        }
    });

    $html('p').each((i, el) => {
        const innerHtml = $html(el).html().trim();
        if (!innerHtml.length || innerHtml === '<br>' || innerHtml === '<br/>') {
            $html(el).remove();
        }
    });

    $html('a:contains("Made with Letterhead")').each((i, el) => {
        $html(el).remove();
    });

    const cleanedHTML = $html.html().trim();

    return `<!--kg-card-begin: html-->${cleanedHTML}<!--kg-card-end: html-->`;
};

const mapNewsletterConfig = (args) => { // eslint-disable-line no-unused-vars
    const {postData, options} = args;

    debug(`Mapping data for ${postData.slug}`);

    const dateNow = new Date().toISOString();

    const mappedData = {
        url: `${options.url}/newsletters/${postData.slug}`,
        data: {
            slug: postData.slug,
            published_at: postData.newsletter_published_at ?? dateNow,
            updated_at: postData.newsletter_published_at ?? dateNow,
            created_at: postData.newsletter_created_at ?? dateNow,
            title: postData.headline,
            custom_excerpt: postData.subheadline ?? null,
            type: 'post',
            html: null,
            status: 'published',
            visibility: 'public',
            tags: []
        }
    };

    mappedData.data.html = processNewsletterContent(postData.content, options);

    mappedData.data.tags.push({
        url: `migrator-added-tag-newsletter`,
        data: {
            slug: `hash-newsletter`,
            name: `#newsletter`
        }
    });

    mappedData.data.tags.push({
        url: `migrator-added-tag`,
        data: {
            slug: `hash-tinynews`,
            name: `#tinynews`
        }
    });

    mappedData.data.author = {
        url: `/author/newsletter-author`,
        data: {
            slug: `newsletter`,
            name: 'Newsletter',
            email: 'newsletter@example.com'
        }
    };

    return mappedData;
};

const mapContent = async (args) => {
    const {options} = args;
    const {articles, pages, newsletters, authors} = options;

    const output = {
        posts: []
    };

    let authorDataJSON = null;
    if (authors) {
        debug(`Parsing Author info from ${authors}`);
        const authorDataJSONString = await readFile(authors, 'utf8');
        authorDataJSON = JSON.parse(authorDataJSONString);
    }

    if (articles) {
        debug(`Parsing Article info from ${articles}`);
        const articlesJSONString = await readFile(articles, 'utf8');
        const articlesJSON = JSON.parse(articlesJSONString);

        await articlesJSON.forEach((data) => {
            output.posts.push(mapPostPageConfig({
                postData: data,
                authorsData: authorDataJSON,
                postType: 'post',
                options
            }));
        });
    }

    if (pages) {
        debug(`Parsing Pages info from ${pages}`);
        const pagesJSONString = await readFile(pages, 'utf8');
        const pagesJSON = JSON.parse(pagesJSONString);

        await pagesJSON.forEach((data) => {
            output.posts.push(mapPostPageConfig({
                postData: data,
                authorsData: authorDataJSON,
                postType: 'page',
                options
            }));
        });
    }

    if (newsletters) {
        debug(`Parsing Newsletters info from ${newsletters}`);
        const newslettersJSONString = await readFile(newsletters, 'utf8');
        const newslettersJSON = JSON.parse(newslettersJSONString);

        await newslettersJSON.data.newsletter_editions.forEach((data) => {
            output.posts.push(mapNewsletterConfig({
                postData: data,
                options
            }));
        });
    }

    return output;
};

export {
    textOnly,
    mapPostPageConfig,
    mapNewsletterConfig,
    processNewsletterContent,
    mapContent
};
