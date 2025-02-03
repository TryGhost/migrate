// import processor from '../lib/processor.js';
import {wpCDNToLocal, processExcerpt, makeInlinerUrls} from '../lib/utils.js';

describe('Process excerpt text handling', function () {
    test('Basic text', function () {
        let processed = processExcerpt('Hello');
        expect(processed).toEqual('Hello');
    });

    test('Basic text in <p> tags', function () {
        let processed = processExcerpt('<p>Hello world</p>');
        expect(processed).toEqual('Hello world');
    });

    test('Text with formatting tags', function () {
        let processed = processExcerpt('<p><p>Hello <b>world</b><br>\n\n\t\t\r\r <u>this</u>\r\n is my <span><em>excerpt</em></span></p></p>');
        expect(processed).toEqual('Hello world this is my excerpt');
    });

    test('Removes excess spaces', function () {
        let processed = processExcerpt('<p> Hello     world</p>');
        expect(processed).toEqual('Hello world');
    });

    test('Does not trim very long string', function () {
        let theString = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum tempus ut massa at cursus. Donec at sapien felis. Pellentesque rutrum arcu velit, eu pulvinar lorem consectetur porta. Nulla elementum dapibus ornare. Fusce in imperdiet nisl. Nulla viverra dapibus sapien id consectetur. Duis pharetra tempor ante, vel bibendum felis blandit non. Duis ut sem ac ligula finibus mattis vitae eget turpis. Praesent a dictum diam, ut pretium arcu. Aenean venenatis, sapien et euismod tincidunt, ex massa venenatis ex, non pellentesque nibh augue ac dolor. In at commodo orci, ut viverra purus. Maecenas at leo rhoncus tellus aliquet porta eu ac libero. Maecenas sagittis quis enim sed bibendum. Praesent mi nunc, mattis eu mattis ut, porta rhoncus felis. Phasellus elit est, vehicula non elit sed, tempor elementum felis. Nullam imperdiet porttitor enim non ultrices. Pellentesque dignissim sem sed tempus lacinia. Proin gravida mollis justo sed convallis. Morbi mattis est tincidunt est pharetra pulvinar. Vivamus scelerisque gravida cursus. Pellentesque non lorem ultrices, eleifend enim sed, gravida erat. Interdum et malesuada fames ac ante ipsum primis in faucibus. Pellentesque faucibus eget magna at facilisis. Praesent feugiat lacinia sem, eu blandit ipsum fermentum eu.';
        let processed = processExcerpt(`<p><p>${theString}</p></p>`);
        expect(processed).toEqual(theString);
    });
});

describe('wpCDNToLocal', function () {
    test('Does not amend non-CDN URLs', function () {
        const updated = wpCDNToLocal('http://test.com/image.jpg?this-should=stay&and=this');
        expect(updated).toEqual('http://test.com/image.jpg?this-should=stay&and=this');
    });

    test('Updated simple CDN URL', function () {
        const updated = wpCDNToLocal('https://i0.wp.com/example.com/wp-content/uploads/2021/02photo.jpg?resize=200%2C300&amp;ssl=1');
        expect(updated).toEqual('https://example.com/wp-content/uploads/2021/02photo.jpg');
    });

    test('Updated long & subdirectory CDN URL', function () {
        const updated = wpCDNToLocal('https://i0.wp.com/this-is-a-long-one.com/subdir/wp-content/uploads/2021/02photo.jpg?resize=200%2C300&amp;ssl=1');
        expect(updated).toEqual('https://this-is-a-long-one.com/subdir/wp-content/uploads/2021/02photo.jpg');
    });
});

describe('Inliner domain list generator', function () {
    test('does the thing', () => {
        const domains = makeInlinerUrls({domain: 'https://hello.example.com'});

        expect(domains).toBeArrayOfSize(4);

        expect(domains).toEqual([
            'http://example.com',
            'https://example.com',
            'http://hello.example.com',
            'https://hello.example.com'
        ]);
    });
});
