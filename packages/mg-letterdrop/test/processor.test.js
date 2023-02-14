import processor from '../lib/processor.js';
import fixture from './fixtures/api-response.json';

describe('Process', function () {
    test('Can convert a single post', function () {
        const ctx = {
            result: fixture,
            options: {
                url: 'https://example.com',
                addPrimaryTag: 'Newsletter',
                email: 'person@example.com',
                createAuthors: true
            }
        };
        const response = processor.all(ctx);
        const posts = response.posts;

        expect(posts).toBeArrayOfSize(2);

        const post = posts[0];

        expect(post).toHaveProperty('url');
        expect(post).toHaveProperty('data');

        expect(post.url).toEqual('https://example.com/p/lorem-ipsum');

        const data = post.data;

        expect(data.slug).toEqual('lorem-ipsum');
        expect(data.title).toEqual('Lorem ipsum');
        expect(data.meta_title).toEqual('Meta title lorem ipsum dolor sit amet consectetur adipiscing elit');
        expect(data.meta_description).toEqual('Meta description lorem ipsum dolor sit amet consectetur adipiscing elit');
        expect(data.status).toEqual('published');
        expect(data.published_at).toEqual('2023-02-03T09:49:30.272Z');
        expect(data.html).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam eu risus metus. Etiam aliquet leo eget urna gravida, ac accumsan diam rutrum. Curabitur facilisis, nulla non lacinia dictum, urna sapien tincidunt diam, non elementum ante elit quis justo.</p><ul><li>Praesent vehicula libero nunc, in scelerisque nisl mattis facilisis</li><li>Praesent ornare velit vitae arcu tincidunt vulputate</li><li>Phasellus a nibh a tellus accumsan varius</li></ul><h2>Praesent felis augue, auctor aliquet dui ut</h2><p>Sollicitudin varius est. <a href="https://example.com/p/dolor-simet">Aenean</a> tincidunt eu tellus sit amet hendrerit.</p>');
        expect(data.custom_excerpt).toEqual('Lorem ipsum dolor sit amet consectetur adipiscing elit');
        expect(data.feature_image).toEqual('https://example.com/lorem-ipsum-cover.webp');

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(4);
        expect(tags[0].url).toEqual('/tag/newsletter');
        expect(tags[0].data.slug).toEqual('newsletter');
        expect(tags[0].data.name).toEqual('Newsletter');
        expect(tags[1].url).toEqual('migrator-added-tag-lorem');
        expect(tags[1].data.slug).toEqual('lorem');
        expect(tags[1].data.name).toEqual('Lorem');
        expect(tags[2].url).toEqual('migrator-added-tag-ipsum');
        expect(tags[2].data.slug).toEqual('ipsum');
        expect(tags[2].data.name).toEqual('Ipsum');
        expect(tags[3].url).toEqual('migrator-added-tag');
        expect(tags[3].data.slug).toEqual('hash-letterdrop');
        expect(tags[3].data.name).toEqual('#letterdrop');

        const authors = data.authors;

        expect(authors).toBeArrayOfSize(1);
        expect(authors[0].url).toEqual('/author/john-smith');
        expect(authors[0].data.email).toEqual('john-smith@example.com');
        expect(authors[0].data.slug).toEqual('john-smith');
        expect(authors[0].data.name).toEqual('John Smith');
    });
});
