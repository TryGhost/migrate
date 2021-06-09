/**
 * Custom Should Assertions
 *
 * Add any custom assertions to this file.
 */

should.Assertion.add('GhostPost', function () {
    this.params = {operator: 'to be a valid Ghost Post'};
    this.obj.should.be.an.Object();
    this.obj.should.not.have.properties(['url', 'data']);
    this.obj.should.have.properties(['slug', 'title', 'status']); // bare minimum properties to be useful
});

should.Assertion.add('GhostUser', function () {
    this.params = {operator: 'to be a valid Ghost User'};
    this.obj.should.be.an.Object();
    this.obj.should.not.have.properties(['url', 'data']);
    this.obj.should.have.properties(['slug', 'name', 'email', 'roles']);
});

should.Assertion.add('GhostTag', function () {
    this.params = {operator: 'to be a valid Ghost Tag'};
    this.obj.should.be.an.Object();
    this.obj.should.not.have.properties(['url', 'data']);
    this.obj.should.have.properties(['slug', 'name']);
});

should.Assertion.add('GhostJSON', function () {
    this.params = {operator: 'to be a valid Ghost JSON'};
    this.obj.should.be.an.Object();
    this.obj.should.have.properties(['meta', 'data']);
    this.obj.meta.should.be.an.Object();
    this.obj.meta.should.have.properties(['exported_on', 'version']);

    // Basic tables
    this.obj.data.should.have.properties(['posts', 'users', 'tags', 'posts_authors', 'posts_tags']);

    // posts
    this.obj.data.posts.should.be.an.Array();
    this.obj.data.posts.forEach(post => post.should.be.a.GhostPost());

    // users
    this.obj.data.users.should.be.an.Array();
    this.obj.data.users.forEach(user => user.should.be.a.GhostUser());

    // tags
    if (this.obj.data.tags) {
        this.obj.data.tags.should.be.an.Array();
        this.obj.data.tags.forEach(tag => tag.should.be.a.GhostTag());
    }

    // Relations...

    // Ghost posts must have at least one author, but we still convert to Ghost's expected multiauthor format
    this.obj.data.posts_authors.should.be.an.Array();
    this.obj.data.posts_authors.length.should.be.aboveOrEqual(1);
    this.obj.data.posts_authors.forEach(postAuthor => postAuthor.should.be.an.Object().with.properties(['post_id', 'author_id']));

    // there can be mutliple tags, but also no tags
    this.obj.data.posts_tags.should.be.an.Array();
    if (this.obj.data.posts_tags.length > 0) {
        this.obj.data.posts_tags.forEach(postTag => postTag.should.be.an.Object().with.properties(['post_id', 'tag_id']));
    }
});
