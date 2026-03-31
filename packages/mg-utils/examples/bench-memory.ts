// Run with: node --expose-gc --import tsx/esm examples/bench-memory.ts
// Or without GC: npx tsx examples/bench-memory.ts
// Measures peak memory when parsing 500 posts through parseFragment
import {domUtils} from '../src/index.js';

const POST_COUNT = 500;
const gc = (globalThis as any).gc as (() => void) | undefined;

let _maxMemoryConsumption = 0;
let _dtOfMaxMemoryConsumption: Date | undefined;

const memoryInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    if (memUsage.rss > _maxMemoryConsumption) {
        _maxMemoryConsumption = memUsage.rss;
        _dtOfMaxMemoryConsumption = new Date();
    }
}, 50);
memoryInterval.unref();

process.on('exit', () => {
    const maxMB = (_maxMemoryConsumption / 1024 / 1024).toFixed(1);
    console.log(`\nPeak RSS: ${maxMB} MB (at ${_dtOfMaxMemoryConsumption?.toISOString()})`);
});

// Realistic post HTML (~2KB each, with images, links, formatting)
function generatePostHtml(i: number): string {
    return `
<h2>Post ${i}: Understanding Modern Web Development</h2>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
<img src="https://example.com/images/post-${i}-hero.jpg" alt="Hero image for post ${i}">
<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. <a href="https://example.com/related-${i}">Read more about this topic</a>.</p>
<blockquote><p>Cras mattis consectetur purus sit amet fermentum. Cras justo odio, dapibus ut facilisis in, egestas eget quam.</p></blockquote>
<ul>
    <li>First point about <strong>important concept</strong></li>
    <li>Second point with <em>emphasis</em></li>
    <li>Third point linking to <a href="https://example.com/resource-${i}">external resource</a></li>
</ul>
<p>Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor. Nullam quis risus eget urna mollis ornare vel eu leo. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus.</p>
<figure><img src="https://example.com/images/post-${i}-inline.jpg" alt="Inline image"><figcaption>Figure ${i}: An illustration</figcaption></figure>
<p>Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Maecenas sed diam eget risus varius blandit sit amet non magna. Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus. Etiam porta sem malesuada magna mollis euismod.</p>
<p>Aenean lacinia bibendum nulla sed consectetur. Cras mattis consectetur purus sit amet fermentum. Donec id elit non mi porta gravida at eget metus. Vestibulum id ligula porta felis euismod semper.</p>
`.trim();
}

// Simulate the typical migration processor pattern:
// parse HTML, manipulate DOM, serialize back to string
function processPost(html: string): string {
    return domUtils.processFragment(html, (parsed) => {
        // Typical transformations done during migration
        // 1. Convert relative URLs to absolute
        for (const img of parsed.$('img')) {
            const src = domUtils.attr(img, 'src');
            if (src && src.startsWith('/')) {
                domUtils.attr(img, 'src', `https://example.com${src}`);
            }
        }

        // 2. Remove unwanted elements
        for (const el of parsed.$('script, style, .advertisement')) {
            el.remove();
        }

        // 3. Clean up links
        for (const a of parsed.$('a')) {
            a.removeAttribute('onclick');
            a.removeAttribute('target');
        }

        // 4. Wrap images in figures if not already wrapped
        for (const img of parsed.$('img:not(figure img)')) {
            domUtils.wrap(img, '<figure></figure>');
        }

        return parsed.html();
    });
}

async function main() {
    const baselineMemory = process.memoryUsage();
    console.log(`Baseline RSS: ${(baselineMemory.rss / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Processing ${POST_COUNT} posts through parseFragment...`);
    if (gc) {
        console.log('(--expose-gc detected, will GC every 100 posts)\n');
    } else {
        console.log('(run with --expose-gc for accurate memory measurement)\n');
    }

    const startTime = Date.now();
    const results: string[] = [];

    for (let i = 0; i < POST_COUNT; i++) {
        const html = generatePostHtml(i);
        results.push(processPost(html));

        if ((i + 1) % 100 === 0) {
            gc?.();
            const mem = process.memoryUsage();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`  Processed ${i + 1}/${POST_COUNT} — RSS: ${(mem.rss / 1024 / 1024).toFixed(1)} MB, Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB (${elapsed}s)`);
        }
    }

    gc?.();
    const endMemory = process.memoryUsage();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\nDone in ${duration}s`);
    console.log(`Final RSS: ${(endMemory.rss / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Heap used: ${(endMemory.heapUsed / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Output HTML total size: ${(results.reduce((sum, r) => sum + r.length, 0) / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
