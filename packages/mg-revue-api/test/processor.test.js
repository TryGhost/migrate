import processor from '../lib/processor.js';

import fixture from './fixtures/api-response.json';

describe('Process', function () {
    test('Can convert a single post', function () {
        const ctx = {
            result: fixture,
            options: {
                addPrimaryTag: 'Newsletter',
                email: 'person@example.com',
                pubName: 'samplenews'
            }
        };
        const response = processor.all(ctx);
        const posts = response.posts;

        expect(posts).toBeArrayOfSize(3);

        const post = posts[2];

        expect(post).toHaveProperty('url');
        expect(post).toHaveProperty('data');

        expect(post.url).toEqual('https://www.getrevue.co/profile/samplenews/issues/weekly-newsletter-of-samplenews-issue-1-123456');

        const data = post.data;

        expect(data.slug).toEqual('weekly-newsletter-of-samplenews-issue-1');
        expect(data.title).toEqual('Weekly newsletter of Sample News - Issue #1');
        expect(data.meta_title).toEqual('Weekly newsletter of Sample News - Issue #1');
        expect(data.status).toEqual('published');
        expect(data.published_at).toEqual('2020-09-28T10:37:27.896Z');
        expect(data.html).toEqual('<h3><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis vestibulum orci ut lacus malesuada vestibulum. Integer quis pulvinar arcu. Ut eleifend porta convallis. Etiam eros arcu, dapibus eleifend lectus vitae, blandit lobortis magna. </p></h3>\n' +
        '<hr>\n' +
        '<p></p><p>Mauris quis elit non leo tincidunt lacinia at id lorem. Mauris tincidunt dignissim cursus. Nunc et venenatis orci, eu dictum odio. Duis nec faucibus purus. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur tincidunt erat in consectetur congue. Vestibulum auctor bibendum finibus.</p><p>Quisque ultrices molestie nisi, sed rutrum mi porttitor sit amet. Etiam porta congue ex, ac euismod erat sollicitudin eget. Duis ac volutpat nibh, sed viverra dui. Ut ut risus risus. Cras porttitor vel lacus non gravida. Aliquam volutpat ut tellus eget luctus. Ut finibus urna quis felis tempus, eu gravida felis tempor. In non rutrum quam, eu molestie dolor. Mauris dui dolor, suscipit a purus eget, malesuada scelerisque elit. Morbi euismod, odio non viverra ornare, mi ex congue nulla, et ornare dolor lectus vitae neque. Morbi egestas libero in justo sagittis, in egestas mi sollicitudin. Proin mollis volutpat rhoncus. Mauris sem leo, vestibulum sed tortor vitae, sollicitudin fringilla diam. Morbi bibendum in erat a imperdiet. Curabitur ultrices consequat nunc, ut rutrum odio consectetur at.</p><p>Donec elementum, eros id tristique tempus, velit ipsum sodales leo, sit amet elementum nulla tellus quis mauris. Integer eros lectus, rhoncus auctor nisi non, viverra condimentum metus. Cras laoreet neque ut massa rhoncus, vel malesuada nisi tristique. Cras ut ex et sem accumsan bibendum nec at tortor. Ut mattis at risus in suscipit. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Morbi et ultrices leo. Morbi tristique lorem in porttitor efficitur. Integer porta rhoncus justo a eleifend. In tristique molestie mollis.</p><p>Vestibulum eget porttitor sapien, sit amet consectetur mi. Donec finibus blandit lacus quis condimentum. Mauris quis elit non leo tincidunt lacinia at id lorem. Mauris tincidunt dignissim cursus. Nunc et venenatis orci, eu dictum odio. Duis nec faucibus purus. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur tincidunt erat in consectetur congue. Vestibulum auctor bibendum finibus.</p><p></p>\n' +
        '<h2>Lorem Ipsum</h2>\n' +
        '<p></p><p>Quisque ultrices molestie nisi, sed rutrum mi porttitor sit amet. Etiam porta congue ex, ac euismod erat sollicitudin eget. Duis ac volutpat nibh, sed viverra dui. Ut ut risus risus. Cras porttitor vel lacus non gravida. Aliquam volutpat ut tellus eget luctus. Ut finibus urna quis felis tempus, eu gravida felis tempor. In non rutrum quam, eu molestie dolor. Mauris dui dolor, suscipit a purus eget, malesuada scelerisque elit. Morbi euismod, odio non viverra ornare, mi ex congue nulla, et ornare dolor lectus vitae neque. Morbi egestas libero in justo sagittis, in egestas mi sollicitudin. Proin mollis volutpat rhoncus. Mauris sem leo, vestibulum sed tortor vitae, sollicitudin fringilla diam. Morbi bibendum in erat a imperdiet. Curabitur ultrices consequat nunc, ut rutrum odio consectetur at.</p><p></p>\n' +
        '<figure class="kg-card kg-image-card kg-card-hascaption"><img alt src="https://s3.amazonaws.com/revue/items/images/006/579/255/original/388acd31c35070180426e84a20636024.jpeg?1601375168"><figcaption>A block of buildings</figcaption></figure>\n' +
        '<p></p><p>Donec elementum, eros id tristique tempus, velit ipsum sodales leo, sit amet elementum nulla tellus quis mauris. Integer eros lectus, rhoncus auctor nisi non, viverra condimentum metus. Cras laoreet neque ut massa rhoncus, vel malesuada nisi tristique. Cras ut ex et sem accumsan bibendum nec at tortor. Ut mattis at risus in suscipit. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Morbi et ultrices leo. Morbi tristique lorem in porttitor efficitur. Integer porta rhoncus justo a eleifend. In tristique molestie mollis. Vestibulum eget porttitor sapien, sit amet consectetur mi. Donec finibus blandit lacus quis condimentum.</p><p></p>\n');

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(2);
        expect(tags[0].url).toEqual('/tag/newsletter');
        expect(tags[0].data.name).toEqual('Newsletter');
        expect(tags[1].url).toEqual('migrator-added-tag');
        expect(tags[1].data.name).toEqual('#revue');

        const author = data.author;

        expect(author.url).toEqual('/author/samplenews');
        expect(author.data.email).toEqual('person@example.com');
        expect(author.data.slug).toEqual('samplenews');
    });

    it('Can convert a post with embeds', function () {
        const ctx = {
            result: fixture,
            options: {
                addPrimaryTag: 'Newsletter',
                email: 'person@example.com',
                pubName: 'samplenews'
            }
        };
        const response = processor.all(ctx);
        const posts = response.posts;

        const post = posts[1];

        expect(post.data.html).toEqual('<h3><p>Sed rutrum, est non scelerisque condimentum, nunc augue finibus erat, id lacinia nunc nulla in quam. Cras scelerisque diam et ante luctus, ac varius dolor posuere. Curabitur id velit in libero ullamcorper pellentesque quis a nunc.</p></h3>\n' +
        '<hr>\n' +
        '<figure class="kg-card kg-embed-card">\n' +
        '<blockquote class="twitter-tweet"><a href="https://twitter.com/Ghost/status/1278327104803758080"></a></blockquote>\n' +
        '<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>\n' +
        '</figure>\n' +
        '<p></p><p>Aenean finibus risus in sem finibus mattis. Maecenas at efficitur mauris, ac <strong>fermentum</strong> quam. <em>Interdum</em> et <strong><em>malesuada</em></strong> fames ac ante ipsum <a href="https://ghost.org?utm_source=active%20users&utm_medium=email&utm_campaign=feature%20launch" target="_blank">primis</a> in faucibus. Morbi mollis efficitur dolor ac auctor. Ut nunc nulla, tempor quis viverra ac, efficitur et arcu.</p><blockquote>Nam elementum, felis quis mollis venenatis, justo dolor pulvinar odio, sed vestibulum neque libero in nulla.</blockquote><p><br></p><ol><li>Mauris mauris urna, lacinia quis faucibus in</li><li>Malesuada a erat</li><li>Donec scelerisque arcu in pulvinar fermentum. Curabitur efficitur nunc ante, at mollis mauris tincidunt vel.</li></ol><p>Donec consequat hendrerit diam. Maecenas ornare tincidunt eros, id condimentum dui aliquet eu.&nbsp;</p><p></p>\n' +
        '<!--kg-card-begin: embed--><figure class="kg-card kg-embed-card">\n' +
        '<iframe src="https://www.youtube.com/embed/Xzp6YgssAiE?feature=oembed" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="" frameborder="0"></iframe>\n' +
        '</figure><!--kg-card-end: embed-->\n' +
        '<!--kg-card-begin: embed--><figure class="kg-card kg-embed-card">\n' +
        '<iframe src="https://www.youtube.com/embed/Xzp6YgssAiE?feature=oembed" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="" frameborder="0"></iframe>\n' +
        '</figure><!--kg-card-end: embed-->\n');
    });

    it('Can remove UTM properties from link block headers', function () {
        const ctx = {
            result: fixture,
            options: {
                addPrimaryTag: 'Newsletter',
                email: 'person@example.com',
                pubName: 'samplenews'
            }
        };
        const response = processor.all(ctx);
        const posts = response.posts;

        const post = posts[0];

        expect(post.data.html).toEqual('<h3><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. </p></h3>\n' +
        '<hr>\n' +
        '<h2>Another Test</h2>\n' +
        '<p></p><p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. </p><p><br></p><p></p>\n' +
        '<figure class="kg-card kg-image-card revue-image"><img alt="Apple" src="https://s3.amazonaws.com/revue/items/images/006/615/191/web/open_graph_logo.png"></figure><p>\n' +
        '\n' +
        '<h3><a href="https://www.apple.com/">Apple</a></h3>\n' +
        'Discover the innovative world of Apple and shop everything iPhone, iPad, Apple Watch, Mac, and Apple TV, plus explore accessories, entertainment, and expert device support.\n' +
        '</p>\n' +
        '<div style="clear: both;"></div>\n' +
        '<p></p><p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p><p></p>\n');
    });
});
