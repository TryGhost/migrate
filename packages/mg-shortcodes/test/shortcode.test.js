import Shortcodes from '../lib/Shortcodes.js';

describe('Interface', function () {
    test('Can init with blank state', function () {
        const shortcodes = new Shortcodes();

        expect(shortcodes).toContainAllKeys(['html', 'shortcodes']);
        expect(shortcodes.html).toEqual('');
        expect(shortcodes.shortcodes).toBeArrayOfSize(0);
    });

    test('Can add shortcodes to parse', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        expect(shortcodes.shortcodes).toBeArrayOfSize(1);
        expect(shortcodes.shortcodes[0]).toContainAllKeys(['name', 'callback']);
        expect(shortcodes.shortcodes[0].name).toEqual('hr_line');
        expect(shortcodes.shortcodes[0].callback).toBeFunction();
    });

    test('Can add shortcodes to unwrap', function () {
        const shortcodes = new Shortcodes();

        shortcodes.unwrap('block');

        expect(shortcodes.shortcodes).toBeArrayOfSize(1);
        expect(shortcodes.shortcodes[0]).toContainAllKeys(['name', 'callback']);
        expect(shortcodes.shortcodes[0].name).toEqual('block');
        expect(shortcodes.shortcodes[0].callback).toBeFunction();
    });
});

describe('Shortcode attributes', function () {
    test('Handles quoted string', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.url).toEqual('https://example.com');
        });

        const html = `[test url="https://example.com"]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles unquoted string', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.url).toEqual('https://example.com');
        });

        const html = `[test url=https://example.com]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles quoted int', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual(12);
        });

        const html = `[test number="12"]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles unquoted int', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual(12);
        });

        const html = `[test number=12]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles quoted negative int', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual(-12);
        });

        const html = `[test number="-12"]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles unquoted negative int', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual(-12);
        });

        const html = `[test number=-12]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles quoted float', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual(1.2);
        });

        const html = `[test number="1.2"]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles unquoted float', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual(1.2);
        });

        const html = `[test number=1.2]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles quoted negative float', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual(-1.2);
        });

        const html = `[test number="-1.2"]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles unquoted negative float', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual(-1.2);
        });

        const html = `[test number=-1.2]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles quoted numbers with more than 1 decimal', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual('1.2.3');
        });

        const html = `[test number="1.2.3"]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles unquoted numbers with more than 1 decimal', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual('1.2.3');
        });

        const html = `[test number=1.2.3]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles quoted negative numbers with more than 1 decimal', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual('-1.2.3');
        });

        const html = `[test number="-1.2.3"]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles unquoted negative numbers with more than 1 decimal', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.number).toEqual('-1.2.3');
        });

        const html = `[test number=-1.2.3]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles valueless keys', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.noval).toEqual(true);
        });

        const html = `[test noval]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handles multiple attributes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('test', ({attrs}) => {
            expect(attrs.url).toEqual('https://example.com');
            expect(attrs.number).toEqual(12);
            expect(attrs.noval).toEqual(true);
        });

        const html = `[test url="https://example.com" number="12" noval]Hello[/test]`;

        shortcodes.parse(html);
    });

    test('Handle encoded attribute key & value quotes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('et_pb_button', ({attrs}) => {
            expect(attrs.button_url).toEqual('https://example.com/test-link');
            expect(attrs.button_text).toEqual('Case');
            expect(attrs.Study).toEqual(true);
            expect(attrs.Work).toEqual(false);
            expect(attrs.rest).toEqual(true);

            return `<a href="${attrs.button_url}">${attrs.button_text}</a>`;
        });

        const html = `[et_pb_button button_url="”https://example.com/test-link”" button_text="”Case" Study”="true" Work="false" rest][/et_pb_button]`;

        let parsed = shortcodes.parse(html);

        expect(parsed).toEqual('<a href="https://example.com/test-link">Case</a>');
    });

    test('Handle key & value quote entities', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('et_pb_button', ({attrs}) => {
            expect(attrs.button_url).toEqual('https://example.com/test-link');
            expect(attrs.button_text).toEqual('Case');

            return `<a href="${attrs.button_url}">${attrs.button_text}</a>`;
        });

        const html = `[et_pb_button button_url=&quot;https://example.com/test-link&quot; button_text=&quot;Case&quot;][/et_pb_button]`;

        let parsed = shortcodes.parse(html);

        expect(parsed).toEqual('<a href="https://example.com/test-link">Case</a>');
    });

    test('Handle empty key values', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('et_pb_button', ({attrs}) => {
            expect(attrs.button_url).toEqual('');
            expect(attrs.button_text).toEqual('Case');
            expect(attrs.button_alt).toEqual('');

            return `<a href="${attrs.button_url}" alt="${attrs.button_alt}">${attrs.button_text}</a>`;
        });

        const html = `[et_pb_button button_url="" button_text="Case" button_alt=]`;

        let parsed = shortcodes.parse(html);

        expect(parsed).toEqual('<a href="" alt="">Case</a>');
    });
});

describe('Shortcode processing', function () {
    test('Returns given HTML', function () {
        const shortcodes = new Shortcodes();
        const html = '<p>Hello world</p>';
        expect(shortcodes.parse(html)).toEqual('<p>Hello world</p>');
    });

    test('Converts a no-slash self-closing shortcode', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `<p>Hello world</p>[hr_line]`;
        expect(shortcodes.parse(html)).toEqual('<p>Hello world</p><hr>');
    });

    test('Converts a no-slash self-closing shortcode with attributes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', ({attrs}) => {
            return `<hr style="border-color: ${attrs.color}; border-width: ${attrs.size}px;">`;
        });

        const html = `<p>Hello world</p>[hr_line color="red" size=2]`;
        expect(shortcodes.parse(html)).toEqual('<p>Hello world</p><hr style="border-color: red; border-width: 2px;">');
    });

    test('Converts slashed self-closing shortcode', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `<p>Hello world</p>[hr_line /]`;
        expect(shortcodes.parse(html)).toEqual('<p>Hello world</p><hr>');
    });

    test('Converts slashed self-closing shortcode with attributes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', ({attrs}) => {
            return `<hr style="border-color: ${attrs.color}; border-width: ${attrs.size}px;">`;
        });

        const html = `<p>Hello world</p>[hr_line color="red" size=2 /]`;
        expect(shortcodes.parse(html)).toEqual('<p>Hello world</p><hr style="border-color: red; border-width: 2px;">');
    });

    test('Can change content value', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        const html = `<p>Hello [uppercase]world[/uppercase]</p>`;
        expect(shortcodes.parse(html)).toEqual('<p>Hello WORLD</p>');
    });

    test('Can handle multiples of the same shortcode', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        const html = `<p>Hello [uppercase]pretty[/uppercase] [uppercase]world[/uppercase]</p>`;
        expect(shortcodes.parse(html)).toEqual('<p>Hello PRETTY WORLD</p>');
    });

    test('Can handle multiple different shortcodes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `<p>Hello [uppercase]pretty[/uppercase] [uppercase]world[/uppercase]</p>[hr_line]<p>Lorem</p>[hr_line]`;
        expect(shortcodes.parse(html)).toEqual('<p>Hello PRETTY WORLD</p><hr><p>Lorem</p><hr>');
    });

    test('Can use shortcode attributes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('link', ({attrs, content}) => {
            expect(attrs.url).toEqual('https://another.example.com');
            expect(attrs.open_in).toEqual('_blank');
            expect(content).toEqual('<i>My content</i>');

            return `<a href="${attrs.url}" target="${attrs.open_in}">${content}</a>`;
        });

        const html = `<p>Hello world</p>[link url="https://another.example.com" open_in="_blank"]<i>My content</i>[/link]`;
        expect(shortcodes.parse(html)).toEqual('<p>Hello world</p><a href="https://another.example.com" target="_blank"><i>My content</i></a>');
    });

    test('Can handle nested shortcodes', function () {
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

        expect(parsed).toEqual('<span><b><u><div>Hello</div><hr></u></b><b>Small</b></span>');
    });

    test('Can handle nested use of the same shortcode', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('span', ({attrs, content}) => {
            return `<span style="color: ${attrs.color};">${content}</span>`;
        });

        const html = `[span color="blue"]Hello [span color="red"]World[/span][/span]`;

        let parsed = shortcodes.parse(html);

        expect(parsed).toEqual('<span style="color: blue;">Hello <span style="color: red;">World</span></span>');
    });

    test('Can unwrap shortcodes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.unwrap('block');

        const html = `[block]Hello world[/block]`;

        let parsed = shortcodes.parse(html);

        expect(parsed).toEqual('Hello world ');
    });

    test('Can unwrap nested shortcodes', function () {
        const shortcodes = new Shortcodes();

        shortcodes.unwrap('block');
        shortcodes.unwrap('outer');
        shortcodes.unwrap('inner');

        const html = `[outer][block][inner]Hello world[/inner] [inner]Lorem Ipsum[/inner][/block][/outer]`;

        let parsed = shortcodes.parse(html);

        expect(parsed).toEqual('Hello world  Lorem Ipsum   ');
    });

    test('Can handle complex combinations', function () {
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

        expect(parsed).toEqual('HELLO<HR> <hr> WORLD <hr>');
    });

    test('Can leave unhandled shortcodes alone', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('uppercase', ({content}) => {
            return content.toUpperCase();
        });

        shortcodes.add('hr_line', () => {
            return '<hr>';
        });

        const html = `[block][uppercase]Hello[hr_line size="small"][/uppercase] [hr_line] [uppercase]world[/uppercase][/block] [hr_line] [Leave this alone] [unhandled]contents[/unhandled] This is just a bit of text`;

        let parsed = shortcodes.parse(html);

        expect(parsed).toEqual('[block]HELLO<HR> <hr> WORLD[/block] <hr> [Leave this alone] [unhandled]contents[/unhandled] This is just a bit of text');
    });

    test('Can remove shortcode and content', function () {
        const shortcodes = new Shortcodes();

        shortcodes.add('hr_line', () => {
            return '';
        });

        shortcodes.add('remove', () => {
            return '';
        });

        const html = `Hello [hr_line] world [hr_line] [remove]Remove this[/remove]`;

        let parsed = shortcodes.parse(html);

        expect(parsed).toEqual('Hello  world  ');
    });
});
