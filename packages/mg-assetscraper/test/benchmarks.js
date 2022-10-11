// This currently takes ~14 seconds on repeat runs

import AssetScraper from '../lib/AssetScraper.js';
import makeTaskRunner from '../../migrate/lib/task-runner.js.js';

const numOfRuns = 5000;

const imageScraper = new AssetScraper();

// First create a huge bunch of test data
let cache = [];

[...Array(numOfRuns)].forEach((_, i) => {
    cache.push({
        remote: `image-${i}.jpg`,
        newRemote: `image-${i}.jpg`,
        newLocal: `https://example.com/image-${i}.jpg`
    });
});

imageScraper.loadFromCache(cache);

console.time('assetFindReplaceFromCache'); // eslint-disable-line no-console

// First create a huge bunch of test data
let htmlStrings = [];

[...Array(numOfRuns)].forEach((_, i) => {
    htmlStrings.push(`<p><img src="image-${i}.jpg" /></p>`);
});

const html = htmlStrings.join('');

// Now set that as out initial value
imageScraper._initialValue = html;

imageScraper.findInHTML(html);

(async () => {
    let tasks = imageScraper.updateReferences();
    const doTasks = makeTaskRunner(tasks, {concurrent: false});
    await doTasks.run();

    console.timeEnd('assetFindReplaceFromCache'); // eslint-disable-line no-console
})();
