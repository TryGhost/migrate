import {processShortcodes} from '../lib/process-shortcodes.js';

describe('Process shortcodes', function () {
    test('Convert convert a caption shortcode to a WP image figure', async function () {
        let html = 'Hello [caption id="attachment_6" align="alignright" width="300"]<img src="http://example.com/wp-content/uploads/2010/07/image.jpg" alt="Image of a thing" title="The Great Image" width="300" height="205" class="size-medium wp-image-6" />[/caption] World';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('Hello <figure class="wp-block-image"><img src="http://example.com/wp-content/uploads/2010/07/image.jpg" alt="Image of a thing" title="The Great Image" width="300" height="205" class="size-medium wp-image-6"></figure> World');
    });

    test('Convert convert a caption shortcode with text to a WP image figure', async function () {
        let html = 'Hello [caption id="attachment_6" align="alignright" width="300"]<img src="http://example.com/wp-content/uploads/2010/07/image.jpg" alt="Image of a thing" title="The Great Image" width="300" height="205" class="size-medium wp-image-6" /> The Great Image[/caption] World';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('Hello <figure class="wp-block-image"><img src="http://example.com/wp-content/uploads/2010/07/image.jpg" alt="Image of a thing" title="The Great Image" width="300" height="205" class="size-medium wp-image-6"><figcaption>The Great Image</figcaption></figure> World');
    });

    test('Can convert vc_separator to <hr>', async function () {
        let html = 'Hello[vc_separator]World';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('Hello<hr>World');
    });

    test('Can convert vc_btn to WP button element', async function () {
        let html = '[vc_btn title="Read more 1" shape="square" color="black" align="center" link="https%3A%2F%2Fexample.com"] [vc_btn title="Read more 2" shape="square" color="black" align="center" link="https://example.com"] [vc_btn title="Read more 3" shape="square" color="black" align="center" link="url:https%3A%2F%2Fexample.com"]';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toInclude('<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="https://example.com">Read more 1</a></div></div>');
        expect(convertedHtml).toInclude('<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="https://example.com">Read more 2</a></div></div>');
        expect(convertedHtml).toInclude('<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="https://example.com">Read more 3</a></div></div>');
    });

    test('Can unwrap common layout shortcodes', async function () {
        let html = 'Hello [vc_row][vc_column][vc_column_text]Lorem[/vc_column_text][/vc_column][vc_column][vc_column_text]Ipsum[/vc_column_text][/vc_column][/vc_row] World';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('Hello Lorem  Ipsum    World');
    });

    test('Can remove gravityform shortcodes', async function () {
        let html = 'Hello [gravityform id="1" title="false" description="false" ajax="true" tabindex="49" field_values="check=First Choice,Second Choice"] World [gravityform id="1" title="false" description="false" ajax="true" tabindex="49" field_values="check=First Choice,Second Choice"/]';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('Hello  World ');
    });

    test('Can remove Divi section shortcodes', async function () {
        let html = '<p>[et_pb_section]My text here[/et_pb_section]</p>';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('<p>My text here </p>');
    });

    test('Can remove tested Divi shortcodes', async function () {
        let html = '<p>[et_pb_section][et_pb_column][et_pb_row]Row 1[/et_pb_row][et_pb_row]Row 2[/et_pb_row][/et_pb_column][/et_pb_section]</p>';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('<p>Row 1 Row 2   </p>');
    });

    test('Can handle Divi text shortcodes', async function () {
        let html = '<p>[et_pb_text]@ET-DC@abcd1234==@[/et_pb_text][et_pb_text]Hello[/et_pb_text]</p>';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('<p> Hello</p>');
    });

    test('Can handle advanced_iframe shortcodes', async function () {
        let html = '[advanced_iframe frameborder="0" height="200" scrolling="no" src="https://example.com?e=123456"]';

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('<iframe src="https://example.com?e=123456" height="200" style="border:0; width: 100%;" loading="lazy"></iframe>');
    });

    test('Can handle code shortcodes', async function () {
        let html = `[code]

const hello () => {
  return new MyClass();
}

[/code]`;

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('<figure><pre class=""><code>const hello () => {\n' +
        '  return new MyClass();\n' +
        '}</code></pre></figure>');
    });

    test('Can handle sourcecode shortcodes', async function () {
        let html = `[sourcecode]

const hello () => {
  return new MyClass();
}

[/sourcecode]`;

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('<figure><pre class=""><code>const hello () => {\n' +
        '  return new MyClass();\n' +
        '}</code></pre></figure>');
    });

    test('Can handle sourcecode shortcodes with language & title', async function () {
        let html = `[sourcecode language="js" title="My method"]

const hello () => {
  return new MyClass();
}

[/sourcecode]`;

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('<figure><pre class="language-js"><code>const hello () => {\n' +
        '  return new MyClass();\n' +
        '}</code></pre><figcaption>My method</figcaption></figure>');
    });

    test('Can handle audio shortcodes', async function () {
        let html = `[audio mp3="/path/to/file.mp3" wav="/path/to/file.wav"][/audio] [audio ogg="/path/to/file.ogg"]`;

        let convertedHtml = await processShortcodes({html});

        expect(convertedHtml).toEqual('<!--kg-card-begin: html--><audio controls src="/path/to/file.mp3" preload="metadata"></audio><!--kg-card-end: html--> <!--kg-card-begin: html--><audio controls src="/path/to/file.ogg" preload="metadata"></audio><!--kg-card-end: html-->');
    });
});
