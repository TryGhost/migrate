// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');

let processor = require('../lib/processor');

const testExcerpt = (summary) => {
    let excerpt = processor.createCleanExcerpt(summary);

    excerpt.length.should.be.lessThanOrEqual(300);
    excerpt.should.endWith('.');
};

describe('Generates sane excerpts', function () {
    it('Handles long paragraphs', function () {
        testExcerpt('<p>In an increasingly competitive sales landscape, companies are searching for fresh tactics to stay ahead. We see a lot of focus on topics like cold outreach, sales objection management, and networking. "Pipeline" and "sales enablement" are trending. Sales teams want to know the best strategies that’ll drive the best sales results.</p>');
    });

    it('handles multiple paragraphs', function () {
        testExcerpt('<p>Data is the key to accountability in SaaS sales. If you’re still living in the 1960s, when the only metrics you measured were deals closed, revenue earned and bottles of brandy polished off, it’s time to get with the times.</p>\n<p>We’re living in the 2020s now, and just about everything you can think of is trackable and measurable: calls made, minutes spent on the phone, emails sent, text messages sent, opportunities created, opportunities closed—all that’s missing is the brandy.</p>\n');
    });

    it('handles one really long sentence', function () {
        testExcerpt('Blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah blah and blah.');
    });

    it('handles formatting', function () {
        testExcerpt('<p>It’s an understatement to say that salespeople don’t have the best track record when it comes to <a href="/turn-doubt-into-trust" rel="noopener" target="_blank">trust</a>. For the average person, we’re <a href="/the-experience-that-stopped-me-from-becoming-a-sleazy-salesperson" rel="noopener" target="_blank">sleazeballs</a> who will say anything to close a sale.</p>\n<p>But the best reps know that real, long-term success doesn’t come from pushy persuasion or verbal acrobatics, but from the exact opposite: Candor, honesty, and <a href="/sales-psychology-vulnerability" rel="noopener" target="_blank">vulnerability</a>.&nbsp;</p>\n<p>That’s because sales are all about <i>change</i>. When you ask someone to buy your product or service, you’re really asking them to change their workflows, habits, and even business.&nbsp;</p>\n<p>Yet humans <i>hate</i> change. We’re skeptical and cynical when anything threatens our ‘normal’ way of doing things. But if you want to be successful in sales, you need to build trust and clear a path towards change in your prospects and teammates.</p>\n<p><strong>You need Radical Candor.</strong></p>\n<p><strong></strong></p>');
    });
});
