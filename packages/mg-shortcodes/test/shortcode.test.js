import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import Shortcodes from '../lib/Shortcodes.js';

describe('Interface', function () {
    it('Can init with blank state', function () {
        const shortcodes = new Shortcodes();

        for (const key of ['html', 'shortcodes']) {
            assert.ok(key in shortcodes);
        }
        assert.equal(shortcodes.html, '');
        assert.equal(shortcodes.shortcodes.length, 0);
    });

    it('Can add shortcodes to parse', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        assert.equal(shortcodes.shortcodes.length, 1);
        for (const key of ['name', 'callback']) {
            assert.ok(key in shortcodes.shortcodes[0]);
        }
        assert.equal(shortcodes.shortcodes[0].name, 'hr_line');
        assert.equal(typeof shortcodes.shortcodes[0].callback, 'function');
    });

    it('Can add shortcodes to unwrap', function () {
        const shortcodes = new Shortcodes();

        shortcodes.unwrap('block');

        assert.equal(shortcodes.shortcodes.length, 1);
        for (const key of ['name', 'callback']) {
            assert.ok(key in shortcodes.shortcodes[0]);
        }
        assert.equal(shortcodes.shortcodes[0].name, 'block');
        assert.equal(typeof shortcodes.shortcodes[0].callback, 'function');
    });
});

describe('Shortcode attributes', function () {
    it('Handles double-quoted string', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.url, 'https://example.com');
        });

        const html = `[test url="https://example.com"]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles single-quoted string', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.url, 'https://example.com');
        });

        const html = `[test url='https://example.com']Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles unquoted string', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.url, 'https://example.com');
        });

        const html = `[test url=https://example.com]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles quoted int', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, 12);
        });

        const html = `[test number="12"]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles unquoted int', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, 12);
        });

        const html = `[test number=12]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles quoted negative int', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, -12);
        });

        const html = `[test number="-12"]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles unquoted negative int', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, -12);
        });

        const html = `[test number=-12]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles quoted float', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, 1.2);
        });

        const html = `[test number="1.2"]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles unquoted float', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, 1.2);
        });

        const html = `[test number=1.2]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles quoted negative float', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, -1.2);
        });

        const html = `[test number="-1.2"]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles unquoted negative float', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, -1.2);
        });

        const html = `[test number=-1.2]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles quoted numbers with more than 1 decimal', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, '1.2.3');
        });

        const html = `[test number="1.2.3"]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles unquoted numbers with more than 1 decimal', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, '1.2.3');
        });

        const html = `[test number=1.2.3]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles quoted negative numbers with more than 1 decimal', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, '-1.2.3');
        });

        const html = `[test number="-1.2.3"]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles unquoted negative numbers with more than 1 decimal', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.number, '-1.2.3');
        });

        const html = `[test number=-1.2.3]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles valueless keys', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.noval, true);
        });

        const html = `[test noval]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handles multiple attributes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            assert.equal(attrs.url, 'https://example.com');
            assert.equal(attrs.number, 12);
            assert.equal(attrs.noval, true);
        });

        const html = `[test url="https://example.com" number="12" noval]Hello[/test]`;

        shortcodes.parse(html);
    });

    it('Handle encoded attribute key & value quotes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('et_pb_button', ({attrs}) => {
            assert.equal(attrs.button_url, 'https://example.com/test-link');
            assert.equal(attrs.button_text, 'Case');
            assert.equal(attrs.Study, true);
            assert.equal(attrs.Work, false);
            assert.equal(attrs.rest, true);

            return `<a href="${attrs.button_url}">${attrs.button_text}</a>`;
        });

        const html = `[et_pb_button button_url="”https://example.com/test-link”" button_text="”Case" Study”="true" Work="false" rest][/et_pb_button]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, '<a href="https://example.com/test-link">Case</a>');
    });

    it('Handle key & value quote entities', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('et_pb_button', ({attrs}) => {
            assert.equal(attrs.button_url, 'https://example.com/test-link');
            assert.equal(attrs.button_text, 'Case');

            return `<a href="${attrs.button_url}">${attrs.button_text}</a>`;
        });

        const html = `[et_pb_button button_url=&quot;https://example.com/test-link&quot; button_text=&quot;Case&quot;][/et_pb_button]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, '<a href="https://example.com/test-link">Case</a>');
    });

    it('Handle key & value quote entities alt', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('et_pb_button', ({attrs}) => {
            assert.equal(attrs.button_url, 'https://example.com/test-link');
            assert.equal(attrs.button_text, 'Case');

            return `<a href="${attrs.button_url}">${attrs.button_text}</a>`;
        });

        const html = `[et_pb_button button_url=&#8221;https://example.com/test-link&#8243; button_text=&#8221;Case&#8243;][/et_pb_button]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, '<a href="https://example.com/test-link">Case</a>');
    });

    it('Handle empty key values', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('et_pb_button', ({attrs}) => {
            assert.equal(attrs.button_url, '');
            assert.equal(attrs.button_text, 'Case');
            assert.equal(attrs.button_alt, '');

            return `<a href="${attrs.button_url}" alt="${attrs.button_alt}">${attrs.button_text}</a>`;
        });

        const html = `[et_pb_button button_url="" button_text="Case" button_alt=]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, '<a href="" alt="">Case</a>');
    });
});

describe('Shortcode processing', function () {
    it('Returns given HTML', function () {
        const shortcodes = new Shortcodes();
        const html = '<p>Hello world</p>';
        assert.equal(shortcodes.parse(html), '<p>Hello world</p>');
    });

    it('Converts a no-slash self-closing shortcode', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `<p>Hello world</p>[hr_line]`;
        assert.equal(shortcodes.parse(html), '<p>Hello world</p><hr>');
    });

    it('Converts a no-slash self-closing shortcode with attributes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', ({attrs}) => {
            return `<hr style="border-color: ${attrs.color}; border-width: ${attrs.size}px;">`;
        });

        const html = `<p>Hello world</p>[hr_line color="red" size=2]`;
        assert.equal(shortcodes.parse(html), '<p>Hello world</p><hr style="border-color: red; border-width: 2px;">');
    });

    it('Converts slashed self-closing shortcode', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `<p>Hello world</p>[hr_line /]`;
        assert.equal(shortcodes.parse(html), '<p>Hello world</p><hr>');
    });

    it('Converts slashed self-closing shortcode with attributes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', ({attrs}) => {
            return `<hr style="border-color: ${attrs.color}; border-width: ${attrs.size}px;">`;
        });

        const html = `<p>Hello world</p>[hr_line color="red" size=2 /]`;
        assert.equal(shortcodes.parse(html), '<p>Hello world</p><hr style="border-color: red; border-width: 2px;">');
    });

    it('Can change content value', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        const html = `<p>Hello [uppercase]world[/uppercase]</p>`;
        assert.equal(shortcodes.parse(html), '<p>Hello WORLD</p>');
    });

    it('Can handle multiples of the same shortcode', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        const html = `<p>Hello [uppercase]pretty[/uppercase] [uppercase]world[/uppercase]</p>`;
        assert.equal(shortcodes.parse(html), '<p>Hello PRETTY WORLD</p>');
    });

    it('Can handle multiple different shortcodes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `<p>Hello [uppercase]pretty[/uppercase] [uppercase]world[/uppercase]</p>[hr_line]<p>Lorem</p>[hr_line]`;
        assert.equal(shortcodes.parse(html), '<p>Hello PRETTY WORLD</p><hr><p>Lorem</p><hr>');
    });

    it('Can use shortcode attributes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('link', ({attrs, content}) => {
            assert.equal(attrs.url, 'https://another.example.com');
            assert.equal(attrs.open_in, '_blank');
            assert.equal(content, '<i>My content</i>');

            return `<a href="${attrs.url}" target="${attrs.open_in}">${content}</a>`;
        });

        const html = `<p>Hello world</p>[link url="https://another.example.com" open_in="_blank"]<i>My content</i>[/link]`;
        assert.equal(shortcodes.parse(html), '<p>Hello world</p><a href="https://another.example.com" target="_blank"><i>My content</i></a>');
    });

    it('Can handle nested shortcodes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('span', ({content}) => {
            return `<span>${content}</span>`;
        });

        shortcodes.add('bold', ({content}) => {
            return `<b>${content}</b>`;
        });

        shortcodes.add('underline', ({content}) => {
            return `<u>${content}</u>`;
        });

        shortcodes.add('an', ({content}) => {
            return `<div>${content}</div>`;
        });

        shortcodes.add('hr_line', () => {
            return `<hr>`;
        });

        const html = `[span][bold][underline][an]Hello[/an][hr_line][/underline][/bold][bold]Small[/bold][/span]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, '<span><b><u><div>Hello</div><hr></u></b><b>Small</b></span>');
    });

    it('Can handle nested use of the same shortcode', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('span', ({attrs, content}) => {
            return `<span style="color: ${attrs.color};">${content}</span>`;
        });

        const html = `[span color="blue"]Hello [span color="red"]World[/span][/span]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, '<span style="color: blue;">Hello <span style="color: red;">World</span></span>');
    });

    it('Can unwrap shortcodes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.unwrap('block');

        const html = `[block]Hello world[/block]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, 'Hello world ');
    });

    it('Can unwrap nested shortcodes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.unwrap('block');
        shortcodes.unwrap('outer');
        shortcodes.unwrap('inner');

        const html = `[outer][block][inner]Hello world[/inner] [inner]Lorem Ipsum[/inner][/block][/outer]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, 'Hello world  Lorem Ipsum   ');
    });

    it('Can handle complex combinations', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('block', ({content}) => {
            return content;
        });

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `[block][uppercase]Hello[hr_line][/uppercase] [hr_line] [uppercase]world[/uppercase][/block] [hr_line]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, 'HELLO<HR> <hr> WORLD <hr>');
    });

    it('Can leave unhandled shortcodes alone', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `[block][uppercase]Hello[hr_line size="small"][/uppercase] [hr_line] [uppercase]world[/uppercase][/block] [hr_line] [Leave this alone] [unhandled]contents[/unhandled] This is just a bit of text`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, '[block]HELLO<HR> <hr> WORLD[/block] <hr> [Leave this alone] [unhandled]contents[/unhandled] This is just a bit of text');
    });

    it('Can remove shortcode and content', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', () => {
            return '';
        });

        shortcodes.add('remove', () => {
            return '';
        });

        const html = `Hello [hr_line] world [hr_line] [remove]Remove this[/remove]`;

        let parsed = shortcodes.parse(html);

        assert.equal(parsed, 'Hello  world  ');
    });

    it('Can handle shortcodes with splits', function () {
        const shortcodes = new Shortcodes();

        shortcodes.addWitSplit('premium_content', 'premelse', 0, ({attrs, content}) => {
            return `<div data-color="${attrs?.color ?? 'blue'}">${content}</div>`;
        });

        shortcodes.add('plan_setup', () => {
            return '';
        });

        const html = `[premium_content color="red"]
        <p>Full post</p>
        [premelse]
        <p>Free excerpt</p>
        [/premium_content]
        [premium_content plan="unregistered," type="show"]
            [plan_setup id="2" hide_title="true"]
        [/premium_content]`;

        let parsed = shortcodes.parse(html).trim();

        assert.ok(parsed.includes('<div data-color="red">'));
        assert.ok(parsed.includes('<p>Full post</p>'));
        assert.ok(!parsed.includes('<p>Free excerpt</p>'));
        assert.ok(!parsed.includes('premium_content'));
        assert.ok(!parsed.includes('plan_setup'));
    });

    it('Can handle shortcodes with splits and return other part', function () {
        const shortcodes = new Shortcodes();

        shortcodes.addWitSplit('premium_content', 'premelse', 1, ({attrs, content}) => {
            return `<div data-color="${attrs?.color ?? 'blue'}">${content}</div>`;
        });

        shortcodes.add('plan_setup', () => {
            return '';
        });

        const html = `[premium_content color="red"]
        <p>Full post</p>
        [premelse]
        <p>Free excerpt</p>
        [/premium_content]
        [premium_content plan="unregistered," type="show"]
            [plan_setup id="2" hide_title="true"]
        [/premium_content]`;

        let parsed = shortcodes.parse(html).trim();

        assert.ok(parsed.includes('<div data-color="blue">'));
        assert.ok(parsed.includes('<p>Free excerpt</p>'));
        assert.ok(!parsed.includes('<p>Full post</p>'));
        assert.ok(!parsed.includes('premium_content'));
        assert.ok(!parsed.includes('plan_setup'));
    });
});
