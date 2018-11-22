/**
 * Custom Should Assertions
 *
 * Add any custom assertions to this file.
 */

should.Assertion.add('MediumMetaObject', function () {
    this.params = {operator: 'to be a valid Medium Meta Object'};
    this.obj.should.be.an.Object();
    this.obj.should.have.properties(['url', 'data']);
    this.obj.url.should.be.a.String();
    this.obj.url.should.match(/^https:\/\/medium\.com/);
    this.obj.data.should.be.an.Object();
    this.obj.data.should.have.property('slug');
});
