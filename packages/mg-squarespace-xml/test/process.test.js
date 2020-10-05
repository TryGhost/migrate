require('./utils');
const path = require('path');
const fs = require('fs').promises;
const process = require('../lib/process');

describe('Process', function () {
    it('Can convert a single published post', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true
            }
        };
        const inputXMLPath = path.resolve('./test/fixtures/sample.xml');
        const input = await fs.readFile(inputXMLPath, 'utf-8');
        const processed = await process.all(input, ctx);

        const post = processed.posts[1];

        post.should.be.an.Object();
        post.url.should.eql('http://dummysite.com/blog/basic-post.html');

        const data = post.data;

        data.should.be.an.Object();
        data.slug.should.eql('basic-post');
        data.title.should.eql('Basic Post');
        data.status.should.eql('published');
        data.published_at.should.eql(new Date('2013-06-07T03:00:44.000Z'));
        data.feature_image.should.eql('https://images.unsplash.com/photo-1601276861758-2d9c5ca69a17?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1268&q=80');
        data.type.should.eql('post');
        data.html.should.eql('<div class="image-block-outer-wrapper layout-caption-below design-layout-inline" data-test="image-block-inline-outer-wrapper"> <figure class="sqs-block-image-figure intrinsic" style="max-width:409.0px;"> <a class="sqs-block-image-link" href="https://anothersite.co.uk" target="_blank"> <div style="padding-bottom:37.4083137512207%;" lass="image-block-wrapper" data-animation-role="image" data-animation-override> <noscript><img src="https://images.unsplash.com/photo-1601275225755-f6a6c1730cb1?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=2765&q=80"></noscript>  </div> </a> </figure> </div> <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris pellentesque nisi sed neque vestibulum pulvinar.</p> <p>Integer iaculis ac elit a bibendum. Suspendisse rhoncus vitae dui vitae ultrices.</p> <!--kg-card-begin: html--><table> <thead> <tr> <th>Width</th> <th>Height</th> </tr> </thead> <tbody> <tr> <td>20</td> <td>15</td> </tr> <tr> <td>40</td> <td>30</td> </tr> </tbody> </table><!--kg-card-end: html--> <p>Aenean velit mi, <a href="https://anothersite.co.uk" target="_blank">dapibus</a> eget ex sed, viverra ultrices mi. Nunc at odio bibendum, gravida lectus sit amet, congue dui. Mauris id justo ante. Cras viverra suscipit bibendum.</p> <p><strong>Sed vulputate consectetur tortor:</strong></p> <ul> <li>Lobortis mauris dapibus in</li> <li>Donec pharetra, orci sit amet fermentum</li> <li>Pretium, nisi arcu molestie mi, nec</li> <li>Consequat turpis tortor vulputate quam, mauris vel quam turpis</li> </ul> <p></p> <p>Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Nulla aliquet neque eu lectus sollicitudin, sit amet vestibulum diam commodo.</p> <p>&nbsp;</p> <p>&nbsp;</p> <p>&nbsp;</p>');

        const tags = data.tags;

        tags.should.be.an.Array().with.lengthOf(2);
        tags[0].url.should.eql('/tag/company-news');
        tags[0].data.slug.should.eql('company-news');
        tags[0].data.name.should.eql('Company News');
        tags[1].url.should.eql('migrator-added-tag');
        tags[1].data.name.should.eql('#sqs');

        const author = data.author;

        author.should.be.an.Object();
        author.url.should.eql('hermione-dummysite-com');
        author.data.slug.should.eql('hermione-dummysite-com');
        author.data.name.should.eql('Hermione Granger');
        author.data.email.should.eql('hermione@dummysite.com');
    });

    it('Can convert a single draft post', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true
            }
        };
        const inputXMLPath = path.resolve('./test/fixtures/sample.xml');
        const input = await fs.readFile(inputXMLPath, 'utf-8');
        const processed = await process.all(input, ctx);

        const post = processed.posts[0];

        post.should.be.an.Object();
        post.url.should.eql('http://dummysite.com/draft-post');

        const data = post.data;

        data.should.be.an.Object();
        data.slug.should.eql('draft-post');
        data.title.should.eql('Draft Post');
        data.status.should.eql('draft');
        data.published_at.should.eql(new Date('2013-11-02T23:02:32.000Z'));
        should.not.exist(data.feature_image);
        data.type.should.eql('post');
        data.html.should.eql('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. </p>');

        const tags = data.tags;

        tags.should.be.an.Array().with.lengthOf(2);
        tags[0].url.should.eql('/tag/company-news');
        tags[0].data.slug.should.eql('company-news');
        tags[0].data.name.should.eql('Company News');
        tags[1].url.should.eql('migrator-added-tag');
        tags[1].data.name.should.eql('#sqs');

        const author = data.author;

        author.should.be.an.Object();
        author.url.should.eql('harry-dummysite-com');
        author.data.slug.should.eql('harry-dummysite-com');
        author.data.name.should.eql('Harry Potter');
        author.data.email.should.eql('harry@dummysite.com');
    });

    it('Can convert a published page', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true
            }
        };
        const inputXMLPath = path.resolve('./test/fixtures/sample.xml');
        const input = await fs.readFile(inputXMLPath, 'utf-8');
        const processed = await process.all(input, ctx);

        const page = processed.posts[2];

        page.should.be.an.Object();
        page.url.should.eql('http://dummysite.com/services');

        const data = page.data;

        data.should.be.an.Object();
        data.slug.should.eql('services');
        data.title.should.eql('Services');
        data.status.should.eql('published');
        data.published_at.should.eql(new Date('2017-05-27T11:33:38.000Z'));
        should.not.exist(data.feature_image);
        data.type.should.eql('page');
        data.html.should.eql('<h2>Our Services</h2><p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>');

        const tags = data.tags;

        tags.should.be.an.Array().with.lengthOf(1);
        tags[0].url.should.eql('migrator-added-tag');
        tags[0].data.name.should.eql('#sqs');

        const author = data.author;

        author.should.be.an.Object();
        author.url.should.eql('migrator-added-author');
        author.data.slug.should.eql('migrator-added-author');
    });
});
