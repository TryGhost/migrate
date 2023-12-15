import cheerio from 'cheerio';

// Keys we've seen so far
// Profile
// Display name
// Email address
// Medium user ID
// Created at
// Twitter
// Twitter account ID
// Facebook display name
// Facebook account ID
// Google email
// Google display name
// Google account ID

const mediumToGhost = {
    'email address': 'email',
    'created at': 'created_at',
    image: 'profile_image',
    twitter: 'twitter'
};

export default ({html}) => {
    let $ = cheerio.load(html);
    let profile = {
        url: $('.u-url').attr('href'),
        data: {
            name: $('.p-name').text(),
            profile_image: $('.u-photo').attr('src'),
            roles: [
                'Contributor'
            ]
        }
    };

    $('ul li').each((i, el) => {
        let [item, value] = $(el).text().split(': ');
        let key = mediumToGhost[item.toLowerCase()] || null;

        if (key) {
            profile.data[key] = value;
        }
    });

    return profile;
};
