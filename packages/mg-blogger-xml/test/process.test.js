require('./utils');
const path = require('path');
const fs = require('fs-extra');
const process = require('../lib/process');
const xml2js = require('xml2js');

function colonToUnderscore(name){
    return name.replace(':', '_');
}

describe('Process', function () {
    beforeEach(async function () {
        let ctx = {
            options: {
                drafts: true,
                email: 'mycompany.com',
                addTag: 'Custom Tag'
            }
        };

        let parser = new xml2js.Parser({
            attrkey: 'attrs',
            charkey: 'value',
            tagNameProcessors: [colonToUnderscore]
        });

        let xml = fs.readFileSync(path.resolve('./test/fixtures/sample.xml'), 'utf8');
        const input = await parser.parseStringPromise(xml);
        const processed = await process.all(input, ctx);

        this.processed = processed;
    });

    it('Can convert multiple posts', async function () {
        const posts = this.processed.posts;

        // The 1st post is just text
        posts[0].data.status.should.eql('published');

        // The 2nd post is has images
        posts[1].data.status.should.eql('published');

        // The 3rd post is a draft
        posts[2].data.status.should.eql('draft');
    });

    it('Can convert a single published post', async function () {
        // The 1st post is just text
        const post = this.processed.posts[0];

        post.should.be.an.Object();
        post.url.should.eql('https://my-old-blog.blogspot.com/2018/09/rhoncus.html');

        const data = post.data;

        data.should.be.an.Object();
        data.slug.should.eql('rhoncus');
        data.title.should.eql('Rhoncus Published Post');
        data.status.should.eql('published');
        data.published_at.should.eql('2018-09-12T09:30:00.001-04:00');
        data.created_at.should.eql('2018-09-12T09:30:00.001-04:00');
        data.updated_at.should.eql('2018-09-12T09:30:22.431-04:00');
        should.equal(data.feature_image, null);
        data.type.should.eql('post');
        data.html.should.eql('Maecenas lacinia, ex ac rhoncus tempus, ante enim condimentum lectus, sed&nbsp;convallis leo sem et tellus. Donec ultricies mauris in magna accumsan suscipit eget laoreet ante. Pellentesque eu pulvinar velit, quis lacinia est. In in odio in metus maximus condimentum. Donec sit amet urna risus. Fusce et nisi a libero commodo lobortis a sit amet metus. Cras lectus dolor.');

        const tags = data.tags;

        tags.should.be.an.Array().with.lengthOf(3);
        tags[0].url.should.eql('/tag/lorem-ipsum');
        tags[0].data.slug.should.eql('lorem-ipsum');
        tags[0].data.name.should.eql('Lorem Ipsum');
        tags[1].url.should.eql('migrator-added-tag');
        tags[1].data.name.should.eql('#blogger');
        tags[2].url.should.eql('migrator-added-tag-2');
        tags[2].data.name.should.eql('Custom Tag');

        const author = data.author;

        author.should.be.an.Object();
        author.url.should.eql('my-old-blog');
        author.data.slug.should.eql('my-old-blog');
        author.data.name.should.eql('My Old Blog');
        author.data.email.should.eql('my-old-blog@mycompany.com');
    });

    it('Can convert a single published post with images', async function () {
        // The 2nd post is has images
        const post = this.processed.posts[1];

        post.should.be.an.Object();
        post.url.should.eql('https://my-old-blog.blogspot.com/2017/09/vestibulum.html');

        const data = post.data;

        data.should.be.an.Object();
        data.slug.should.eql('vestibulum');
        data.title.should.eql('Vestibulum Post With Image');
        data.status.should.eql('published');
        data.published_at.should.eql('2017-09-20T11:46:00.001-04:00');
        data.created_at.should.eql('2017-09-20T11:46:00.001-04:00');
        data.updated_at.should.eql('2017-09-20T11:52:07.578-04:00');
        data.feature_image.should.eql('https://images.com/1234/5678/s2000/-c/IMG_1234.jpg');
        data.type.should.eql('post');
        data.html.should.eql('<figure><img src="https://images.com/1234/5678/s2000/IMG_71234.jpg" alt="My son and I after his first 10K"><figcaption>My son and I after his first 10K</figcaption></figure>Cras posuere ante eget augue suscipit rutrum. Maecenas pulvinar, enim vel euismod feugiat, urna nunc mattis est, vel faucibus purus lacus eget augue. Vestibulum enim orci, molestie eu nulla nec, cursus pellentesque leo. Proin maximus venenatis interdum. Mauris augue ligula, accumsan eu pellentesque vel, pretium sed diam.');

        const tags = data.tags;

        tags.should.be.an.Array().with.lengthOf(4);
        tags[0].url.should.eql('/tag/all-night-party');
        tags[0].data.slug.should.eql('all-night-party');
        tags[0].data.name.should.eql('All Night Party');
        tags[1].url.should.eql('/tag/dance');
        tags[1].data.slug.should.eql('dance');
        tags[1].data.name.should.eql('Dance');
        tags[2].url.should.eql('migrator-added-tag');
        tags[2].data.name.should.eql('#blogger');
        tags[3].url.should.eql('migrator-added-tag-2');
        tags[3].data.name.should.eql('Custom Tag');

        const author = data.author;

        author.should.be.an.Object();
        author.url.should.eql('my-old-blog');
        author.data.slug.should.eql('my-old-blog');
        author.data.name.should.eql('My Old Blog');
        author.data.email.should.eql('my-old-blog@mycompany.com');
    });

    it('Can convert a single draft post', async function () {
        // The 3rd post is a draft
        const post = this.processed.posts[2];

        const data = post.data;

        data.should.be.an.Object();
        data.slug.should.eql('1433646194132758974');
        data.title.should.eql('Maecenas Draft Post');
        data.status.should.eql('draft');
    });
});
