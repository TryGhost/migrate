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

    // Relationships...

    // medium only ever has a single author, but we still convert to Ghost's expected format
    this.obj.should.have.property('authors');
    this.obj.authors.should.be.an.Array();
    this.obj.authors.length.should.eql(1);
    this.obj.authors[0].should.be.a.Number().and.be.above(0);

    // @TODO: tags
    // there can be mutliple tags, but also no tags
    // if (this.obj.tags) {
    //     this.obj.tags.should.be.an.Array();
    //     this.obj.tags.forEach(tag => {
    //         tag.should.be.a.Number().and.be.above(0);
    //     });
    // }
});

should.Assertion.add('GhostUser', function () {
    this.params = {operator: 'to be a valid Ghost User'};
    this.obj.should.be.an.Object();
    this.obj.should.not.have.properties(['url', 'data']);
    this.obj.should.have.properties(['slug', 'name', 'email']);
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

    // @TODO: tags
    //this.obj.data.should.have.properties(['posts', 'users', 'tags']);
    this.obj.data.should.have.properties(['posts', 'users']);

    // posts
    this.obj.data.posts.should.be.an.Array();
    this.obj.data.posts.forEach(post => post.should.be.a.GhostPost());

    // users
    this.obj.data.users.should.be.an.Array();
    this.obj.data.users.forEach(user => user.should.be.a.GhostUser());

    // @TODO: tags
    // this.obj.data.tags.should.be.an.Array();
    // this.obj.data.tags.forEach(tag => tag.should.be.a.GhostTag());
});
