// Switch these lines once there are useful utils
const testUtils = require('./utils');
const processPost = require('../lib/process-post');

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
    it('Can convert a single post', function () {
        const fixture = testUtils.fixtures.readSync('12.json');

        const ctx = {
            fileCache: {
                imagePath: 'content/images/'
            }
        };

        const post = processPost(fixture, globalUser, tags, ctx);

        post.data.should.be.an.Object();
        const data = post.data;

        data.title.should.eql('Issue 12');
        data.custom_excerpt.should.eql('Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
        data.slug.should.eql('12');
        data.status.should.eql('published');
        data.created_at.should.eql('2021-02-02T21:08:42+00:00');
        data.published_at.should.eql('2021-02-02T21:08:42+00:00');
        data.updated_at.should.eql('2021-02-02T21:08:43+00:00');
        data.html.should.eql('<h2>News</h2><h3>Issue 12</h3><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam tempor justo in magna congue, id efficitur eros scelerisque. Integer sagittis pharetra orci, vitae vulputate ante semper vel.</p><p><i>Author Name, Article Site</i></p><hr><h3><a href="https://google.com">This is a search engine</a></h3><p>Curabitur faucibus, libero a pulvinar dignissim, justo est tincidunt arcu, eget rhoncus dolor felis eget enim. Morbi est nisi, porttitor eu magna ut, faucibus varius felis. Nam interdum suscipit dictum.</p><p><i><a href="https://google.com">google.com</a></i></p><h2>Learn</h2><h3><a href="https://example.com/article-title/">Aliquam nec malesuada purus - Author</a></h3><p>Quisque condimentum ultrices massa, vitae malesuada felis hendrerit ut.</p><p><i><a href="https://example.com/article-title/">example.com</a></i></p><hr><h3><a href="https://www.w3.org/">Proin euismod vitae mi ac porta</a></h3><p>Vivamus et molestie nisl. Nam dapibus odio sed mollis sollicitudin. Etiam malesuada urna quis porttitor aliquet.</p><p><i><a href="https://www.w3.org/">https://www.w3.org</a></i></p><h2>Our Sponsor</h2><!--kg-card-begin: html--><a class="kg-card kg-image-card" href="https://courses.example.com"><img class="kg-image" src="/content/images/12/a174e606-7a19-4c86-9f18-1c528a54643a.png" alt="Special offer!" /></a><!--kg-card-end: html--><h3><a href="https://courses.example.com">Special offer!</a></h3><p>Nullam blandit sodales scelerisque.</p><p><i><a href="https://courses.example.com">example.com</a></i></p>');

        data.author.should.be.an.Object();
        data.author.url.should.eql('test-user');
        data.author.data.slug.should.eql('test-user');
        data.author.data.name.should.eql('Test User');
        data.author.data.email.should.eql('test@example.com');

        data.tags.should.be.an.Array().with.lengthOf(2);
        data.tags[0].data.name.should.eql('Newsletter');
        data.tags[1].data.name.should.eql('#curated');
    });
});
