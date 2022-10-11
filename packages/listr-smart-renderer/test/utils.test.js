/* eslint no-undef: 0 */
import {taskNumber} from '../lib/utils.js';

describe('Task Number', function () {
    let index;
    let tasks;

    const taskNumberShouldEql = (result) => {
        return expect(taskNumber(index, tasks)).toEqual(result);
    };

    test('Correctly outputs a simple task number in the format x/y', function () {
        index = 0;
        tasks = new Array(3); // Fake tasks array

        taskNumberShouldEql('1/3');
    });

    test('Can pad a task number correctly in the format 0x/yy', function () {
        index = 3;
        tasks = new Array(14); // Fake tasks array

        taskNumberShouldEql('04/14');
    });

    test('Can pad a task number correctly in the format xx/yy', function () {
        index = 11;
        tasks = new Array(14); // Fake tasks array

        taskNumberShouldEql('12/14');
    });

    test('Can pad a task number correctly in the format 00x/yyy', function () {
        index = 3;
        tasks = new Array(111); // Fake tasks array

        taskNumberShouldEql('004/111');
    });

    test('Can pad a task number correctly in the format 0xx/yyy', function () {
        index = 11;
        tasks = new Array(111); // Fake tasks array

        taskNumberShouldEql('012/111');
    });

    test('Can pad a task number correctly in the format xxx/yyy', function () {
        index = 100;
        tasks = new Array(111); // Fake tasks array

        taskNumberShouldEql('101/111');
    });
});
