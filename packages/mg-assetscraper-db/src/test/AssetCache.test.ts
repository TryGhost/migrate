import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';
import AssetCache from '../lib/AssetCache.js';
import {validate as uuidValidate} from 'uuid';
import fsUtils from '@tryghost/mg-fs-utils';

describe('AssetCache from scratch', () => {
    let assetCache: any;

    beforeEach(async () => {
        assetCache = new AssetCache({
            fileCache: new fsUtils.FileCache('assetcache-tests')
        });

        // Reset the DB (drop the table) and init it again
        await assetCache._reset();
        await assetCache.init();
    });

    // afterEach(async () => {
    //     // await assetCache.fileCache.emptyCurrentCacheDir();
    //     await assetCache._reset();
    // });

    it('Starts with an empty cache', async () => {
        const result = await assetCache.getAll();

        assert.equal(result.length, 0);
    });

    it('Can add & read a single item', async () => {
        const newItem = await assetCache.add('/wp-content/2024/11/01/lorem.jpg');

        // Check we return a newly created object
        assert.equal(newItem.src, '/wp-content/2024/11/01/lorem.jpg');

        // And now get all and check the object is the same
        const result = await assetCache.getAll();

        assert.equal(result.length, 1);
        assert.equal(result[0].id, newItem.id);
        assert.equal(result[0].src, '/wp-content/2024/11/01/lorem.jpg');
    });

    it('Does not add the same item twice', async () => {
        // Add the item first, and get its ID
        const firstInsert = await assetCache.add('/wp-content/2024/11/01/lorem.jpg');
        const firstInsertID = firstInsert.uuid;

        // Try to insert the same item again
        const secondInsert = await assetCache.add('/wp-content/2024/11/01/lorem.jpg');

        // Check the ID of the second ID as it should be the same as the fist (i.e. it didn't insert)
        assert.equal(secondInsert.uuid, firstInsertID);

        // And for good measure, check we only have one item in the DB
        const result = await assetCache.getAll();
        assert.equal(result.length, 1);
    });

    // test('Can find items by where clauses', async () => {
    //     const insert1 = await assetCache.add('/wp-content/2024/11/01/lorem.jpg');
    //     await assetCache.update(insert1.uuid, 'status', 404);

    //     const insert2 = await assetCache.add('/wp-content/2024/11/01/ipsum.jpg');
    //     await assetCache.update(insert2.uuid, 'status', 200);

    //     const insert3 = await assetCache.add('/wp-content/2024/11/01/dolor.jpg');
    //     await assetCache.update(insert3.uuid, 'status', 404);

    //     const results = await assetCache.find((item: any) => item.status === 404);

    //     assert.equal(results.length, 2);
    //     assert.equal(results[0].src, '/wp-content/2024/11/01/lorem.jpg');
    //     assert.equal(results[1].src, '/wp-content/2024/11/01/dolor.jpg');
    // });

    it('Can find a single item by src', async () => {
        await assetCache.add('/wp-content/2024/11/01/lorem.jpg');
        await assetCache.add('/wp-content/2024/11/01/ipsum.jpg');

        const result = await assetCache.findBySrc('/wp-content/2024/11/01/lorem.jpg');

        assert.equal(result.src, '/wp-content/2024/11/01/lorem.jpg');
    });

    // test.skip('Returns empty array if it cannot find any items', async () => {
    //     await assetCache.add('/wp-content/2024/11/01/lorem.jpg');
    //     await assetCache.add('/wp-content/2024/11/01/ipsum.jpg');

    //     // No status were set, so none should be found
    //     const results = await assetCache.find((item: any) => item.status === 404);

    //     assert.deepEqual(results, []);
    // });

    it('Can update a single item', async () => {
        // Insert an item and then update it
        const item = await assetCache.add('/wp-content/2024/11/01/lorem.jpg');
        await assetCache.update(item.id, 'localPath', '/content/images/wp-content/2024/11/01/lorem.jpg');
        await assetCache.update(item.id, 'status', 200);

        const result = await assetCache.getAll();

        assert.equal(result[0].localPath, '/content/images/wp-content/2024/11/01/lorem.jpg');
        assert.equal(result[0].status, 200);
    });

    // test('Can delete a single item', async () => {
    //     await assetCache.add('/wp-content/2024/11/01/lorem.jpg');
    //     await assetCache.add('/wp-content/2024/11/01/amet.jpg');

    //     // Check we have 2
    //     const count1 = await assetCache.getAll();
    //     assert.equal(count1.length, 2);

    //     // Delete the item
    //     await assetCache.deleteBySrc('/wp-content/2024/11/01/amet.jpg');

    //     // Check we have 1
    //     const count2 = await assetCache.getAll();
    //     assert.equal(count2.length, 1);
    // });
});

// describe('AssetCache from existing database', () => {
//     const dbFolder = join(__dirname, '../../src/test/fixtures/test-assets');
//     const dbFolderClone = join(__dirname, '../../src/test/fixtures/clone-test-assets');

//     let assetCache: any;

//     // Clone the fixtures so we can edit them
//     beforeAll(function () {
//         cpSync(dbFolder, dbFolderClone, {recursive: true});

//         assetCache = new AssetCache({
//             folderPath: dbFolderClone
//         });
//     });

//     // Delete the clone after we're done
//     afterAll(function () {
//         rmSync(dbFolderClone, {
//             recursive: true,
//             force: true
//         });
//     });

//     it('Starts with 100 items', async () => {
//         const result = await assetCache.getAll();

//         assert.equal(result.length, 20);
//     });

//     it('Can find items by where clauses', async () => {
//         // Get the 2 items that end in `0.jpg`
//         const results = await assetCache.find((item: any) => item.src.includes('0.jpg'));
//         assert.equal(results.length, 2);
//     });
// });
