const WPAPI = require('wpapi');

module.exports.discover = async (url) => {
    return await WPAPI.discover(url);
};

module.exports.all = async (url) => {
    const site = await this.discover(url);

    const result = {
        posts: [],
        pages: []
    };

    result.posts = await site.posts().embed();

    return result;
};
