import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {cleanHTML} from '../lib/process.js';

describe('Clean HTML', function () {
    it('Can return nothing', function () {
        assert.equal(cleanHTML(), '');
    });

    it('Removes left text alignment', function () {
        let html = '<p style="text-align: left;">Hello</p>';
        let result = cleanHTML({
            html,
            opinionated: true
        });
        assert.equal(result, '<p>Hello</p>');
    });

    it('Removes center text alignment', function () {
        let html = '<p style="text-align: center;">Hello</p>';
        let result = cleanHTML({
            html,
            opinionated: true
        });
        assert.equal(result, '<p>Hello</p>');
    });

    it('Removes right text alignment', function () {
        let html = '<p style="text-align: right;">Hello</p>';
        let result = cleanHTML({
            html,
            opinionated: true
        });
        assert.equal(result, '<p>Hello</p>');
    });

    it('Changes inline font weight to bold tag', function () {
        let html = '<span style="font-weight: bold;">Hello</span> <span style="font-weight: 100;">Hello</span> <span style="font-weight: 800;">Hello</span> <span style="font-weight: revert-layer;">Hello</span>';
        let result = cleanHTML({
            html,
            opinionated: true
        });
        assert.equal(result, '<b>Hello</b> <span>Hello</span> <b>Hello</b> <span>Hello</span>');
    });

    it('Changes bold styles to inner b tag', function () {
        let html = '<a href="https://example.com" style="font-weight: bold;">Hello</a>';
        let result = cleanHTML({
            html,
            opinionated: true
        });
        assert.equal(result, '<a href="https://example.com"><b>Hello</b></a>');
    });

    it('Changes inline font style to italic tag', function () {
        let html = '<span style="font-style: italic;">Hello</span> <span style="font-style: normal;">Hello</span> <span style="font-style: oblique;">Hello</span>';
        let result = cleanHTML({
            html,
            opinionated: true
        });
        assert.equal(result, '<i>Hello</i> <span>Hello</span> <i>Hello</i>');
    });

    it('Changes italic styles to inner b tag', function () {
        let html = '<a href="https://example.com" style="font-style: italic;">Hello</a>';

        let result = cleanHTML({
            html,
            opinionated: true
        });
        assert.equal(result, '<a href="https://example.com"><i>Hello</i></a>');
    });

    it('Removes inline styles and bold & italic tags from headers', function () {
        let html = '<h2>Lorem <b>ipsum</b> <strong>dolor</strong> <i>sit</i> <em>amet</em> <span>consectetur</span> <span style="font-weight: bold;">adipiscing</span> <a href="https://example.com">elit</a> <a href="https://example.com"><b>eiusmod</b></a>  </h2>';
        let result = cleanHTML({
            html,
            opinionated: true
        });
        assert.equal(result, '<h2>Lorem ipsum dolor sit amet consectetur adipiscing <a href="https://example.com">elit</a> <a href="https://example.com">eiusmod</a></h2>');
    });

    it('Removes text color decelerations', function () {
        let html = ['<a href="https://example.com" style="color: red;">Hello</a>',
            '<a href="https://example.com" style="color: rgba(34 12 64 / 0.3);">Hello</a>',
            '<a href="https://example.com" style="color: #090;">Hello</a>',
            '<a href="https://example.com" style="color: #009900;">Hello</a>',
            '<a href="https://example.com" style="color: hsla(30, 100%, 50%, 0.6);">Hello</a>',
            '<a href="https://example.com" style="color: hwb(90 10% 10%);">Hello</a>',
            '<a href="https://example.com" style="color: inherit;">Hello</a>'];

        let result = cleanHTML({
            html: html.join(''),
            opinionated: true
        });
        assert.equal(result, '<a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a>');
    });

    it('Removes background color decelerations', function () {
        let html = ['<a href="https://example.com" style="background-color: red;">Hello</a>',
            '<a href="https://example.com" style="background-color: rgba(34 12 64 / 0.3);">Hello</a>',
            '<a href="https://example.com" style="background-color: #090;">Hello</a>',
            '<a href="https://example.com" style="background: #009900;">Hello</a>',
            '<a href="https://example.com" style="background-color: hsla(30, 100%, 50%, 0.6);">Hello</a>',
            '<a href="https://example.com" style="background-color: hwb(90 10% 10%);">Hello</a>',
            '<a href="https://example.com" style="background-attachment: fixed; background-clip: content-box; background-color: #f00; background-image: url(/image.png); background-origin: content-box; background-position: 10% 25%; background-repeat: no-repeat; background-size: 110%;">Hello</a>'];

        let result = cleanHTML({
            html: html.join(''),
            opinionated: true
        });
        assert.equal(result, '<a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a><a href="https://example.com">Hello</a>');
    });

    it('Removes empty <p> tags', function () {
        let html = ['<p></p>',
            '<p>Hello<br>World</p>',
            '<p><br></p>',
            '<p><br/></p>',
            '<p><br><br></p>',
            '<p><br>Again<br></p>',
            '<p><br><br><br></p>',
            '<p>   </p>'];

        let result = cleanHTML({
            html: html.join(''),
            opinionated: true
        });
        assert.equal(result, '<p>Hello<br>World</p><p>Again</p>');
    });

    it('Removes empty <li> tags', function () {
        let html = ['<li></li>',
            '<li>Hello<br>World</li>',
            '<li><br></li>',
            '<li><br/></li>',
            '<li><br><br></li>',
            '<li><br>Again<br></li>',
            '<li><br><br><br></li>',
            '<li>   </li>'];

        let result = cleanHTML({
            html: html.join(''),
            opinionated: true
        });
        assert.equal(result, '<li>Hello<br>World</li><li>Again</li>');
    });

    it('Wraps special lists in a HTML card', function () {
        let html = '<ol><li value="10">Lorem</li><li>Ipsum</li></ol>';
        let result = cleanHTML({
            html,
            cards: true
        });
        assert.equal(result, '<!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    it('Does not double-wrap carded special lists', function () {
        let html = '<!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->';
        let result = cleanHTML({
            html,
            cards: true
        });
        assert.equal(result, '<!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    it('Does not change Instagram embed', function () {
        let html = '<blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="https://www.instagram.com/p/CogY2A-y2_X/?utm_source=ig_embed&amp;utm_campaign=loading" data-instgrm-version="14" style=" background:#FFF; border:0; border-radius:3px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:540px; min-width:326px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);"><div style="padding:16px;"> <a href="https://www.instagram.com/p/CogY2A-y2_X/?utm_source=ig_embed&amp;utm_campaign=loading" style=" background:#FFFFFF; line-height:0; padding:0 0; text-align:center; text-decoration:none; width:100%;" target="_blank"> <div style=" display: flex; flex-direction: row; align-items: center;"> <div style="background-color: #F4F4F4; border-radius: 50%; flex-grow: 0; height: 40px; margin-right: 14px; width: 40px;"></div> <div style="display: flex; flex-direction: column; flex-grow: 1; justify-content: center;"> <div style=" background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; margin-bottom: 6px; width: 100px;"></div> <div style=" background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; width: 60px;"></div></div></div><div style="padding: 19% 0;"></div> <div style="display:block; height:50px; margin:0 auto 12px; width:50px;"><!-- SVG omitted for brevity --></div><div style="padding-top: 8px;"> <div style=" color:#3897f0; font-family:Arial,sans-serif; font-size:14px; font-style:normal; font-weight:550; line-height:18px;">View this post on Instagram</div></div><div style="padding: 12.5% 0;"></div> <div style="display: flex; flex-direction: row; margin-bottom: 14px; align-items: center;"><div> <div style="background-color: #F4F4F4; border-radius: 50%; height: 12.5px; width: 12.5px; transform: translateX(0px) translateY(7px);"></div> <div style="background-color: #F4F4F4; height: 12.5px; transform: rotate(-45deg) translateX(3px) translateY(1px); width: 12.5px; flex-grow: 0; margin-right: 14px; margin-left: 2px;"></div> <div style="background-color: #F4F4F4; border-radius: 50%; height: 12.5px; width: 12.5px; transform: translateX(9px) translateY(-18px);"></div></div><div style="margin-left: 8px;"> <div style=" background-color: #F4F4F4; border-radius: 50%; flex-grow: 0; height: 20px; width: 20px;"></div> <div style=" width: 0; height: 0; border-top: 2px solid transparent; border-left: 6px solid #f4f4f4; border-bottom: 2px solid transparent; transform: translateX(16px) translateY(-4px) rotate(30deg)"></div></div><div style="margin-left: auto;"> <div style=" width: 0px; border-top: 8px solid #F4F4F4; border-right: 8px solid transparent; transform: translateY(16px);"></div> <div style=" background-color: #F4F4F4; flex-grow: 0; height: 12px; width: 16px; transform: translateY(-4px);"></div> <div style=" width: 0; height: 0; border-top: 8px solid #F4F4F4; border-left: 8px solid transparent; transform: translateY(-4px) translateX(8px);"></div></div></div> <div style="display: flex; flex-direction: column; flex-grow: 1; justify-content: center; margin-bottom: 24px;"> <div style=" background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; margin-bottom: 6px; width: 224px;"></div> <div style=" background-color: #F4F4F4; border-radius: 4px; flex-grow: 0; height: 14px; width: 144px;"></div></div></a><p style=" color:#c9c8cd; font-family:Arial,sans-serif; font-size:14px; line-height:17px; margin-bottom:0; margin-top:8px; overflow:hidden; padding:8px 0 7px; text-align:center; text-overflow:ellipsis; white-space:nowrap;"><a href="https://www.instagram.com/p/CogY2A-y2_X/?utm_source=ig_embed&amp;utm_campaign=loading" style=" color:#c9c8cd; font-family:Arial,sans-serif; font-size:14px; font-style:normal; font-weight:normal; line-height:17px; text-decoration:none;" target="_blank">A post shared by Cat Lovers Club (@catloversclub)</a></p></div></blockquote> <script async src="//www.instagram.com/embed.js"></script>';

        let result = cleanHTML({
            html,
            opinionated: true,
            cards: true
        });
        assert.equal(result, html);
    });

    it('Removes empty attributes', function () {
        let html = '<script async="" data-not-areal-thing src="/example.js"></script>';
        let result = cleanHTML({
            html,
            cards: true
        });
        assert.equal(result, '<script async data-not-areal-thing src="/example.js"></script>');
    });
});
