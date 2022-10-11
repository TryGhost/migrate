/* eslint no-undef: 0 */
import processPost from '../lib/process-post.js';

import fixture from './fixtures/12.json';

const globalUser = {
    url: 'test-user',
    data: {
        slug: 'test-user',
        name: 'Test User',
        email: 'test@example.com'
    }
};

const tags = [
    {
        data: {
            name: 'Newsletter'
        }
    },
    {
        data: {
            name: '#curated'
        }
    }
];

describe('Process', function () {
    test('Can convert a single post', function () {
        const ctx = {
            fileCache: {
                imagePath: 'content/images/'
            }
        };

        const post = processPost(fixture, globalUser, tags, ctx);

        expect(post.data).toBeObject();
        const data = post.data;

        expect(data.title).toEqual('Issue 12');
        expect(data.custom_excerpt).toEqual('Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
        expect(data.slug).toEqual('12');
        expect(data.status).toEqual('published');
        expect(data.created_at).toEqual('2021-02-02T21:08:42+00:00');
        expect(data.published_at).toEqual('2021-02-02T21:08:42+00:00');
        expect(data.updated_at).toEqual('2021-02-02T21:08:43+00:00');
        expect(data.html).toEqual('<h2>News</h2><h3>Issue 12</h3><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam tempor justo in magna congue, id efficitur eros scelerisque. Integer sagittis pharetra orci, vitae vulputate ante semper vel.</p><p><i>Author Name, Article Site</i></p><hr><h3><a href="https://google.com">This is a search engine</a></h3><p>Curabitur faucibus, libero a pulvinar dignissim, justo est tincidunt arcu, eget rhoncus dolor felis eget enim. Morbi est nisi, porttitor eu magna ut, faucibus varius felis. Nam interdum suscipit dictum.</p><p><i><a href="https://google.com">google.com</a></i></p><h2>Learn</h2><h3><a href="https://example.com/article-title/">Aliquam nec malesuada purus - Author</a></h3><p>Quisque condimentum ultrices massa, vitae malesuada felis hendrerit ut.</p><p><i><a href="https://example.com/article-title/">example.com</a></i></p><hr><h3><a href="https://www.w3.org/">Proin euismod vitae mi ac porta</a></h3><p>Vivamus et molestie nisl. Nam dapibus odio sed mollis sollicitudin. Etiam malesuada urna quis porttitor aliquet.</p><p><i><a href="https://www.w3.org/">https://www.w3.org</a></i></p><h2>Our Sponsor</h2><!--kg-card-begin: html--><a class="kg-card kg-image-card" href="https://courses.example.com"><img class="kg-image" src="/content/images/12/a174e606-7a19-4c86-9f18-1c528a54643a.png" alt="Special offer!" /></a><!--kg-card-end: html--><h3><a href="https://courses.example.com">Special offer!</a></h3><p>Nullam blandit sodales scelerisque.</p><p><i><a href="https://courses.example.com">example.com</a></i></p>');

        expect(data.author).toBeObject();
        expect(data.author.url).toEqual('test-user');
        expect(data.author.data.slug).toEqual('test-user');
        expect(data.author.data.name).toEqual('Test User');
        expect(data.author.data.email).toEqual('test@example.com');

        expect(data.tags).toBeArrayOfSize(2);
        expect(data.tags[0].data.name).toEqual('Newsletter');
        expect(data.tags[1].data.name).toEqual('#curated');
    });
});
