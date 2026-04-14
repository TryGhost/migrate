// Run from the packages/mg-queue/ directory:
//   npx tsx examples/silent-mode.ts
/* eslint-disable no-console */
import {Queue, Task} from '../src/index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const results: string[] = [];

const tasks: Task[] = [
    {
        title: 'Background task 1',
        task: async () => {
            await delay(50);
            results.push('task-1');
        }
    },
    {
        title: 'Background task 2',
        task: async () => {
            await delay(30);
            throw new Error('Simulated error in silent example');
        }
    },
    {
        title: 'Background task 3',
        task: async (ctx) => {
            await delay(30);
            ctx.skip();
        }
    },
    {
        title: 'Background task 4',
        task: async () => {
            await delay(30);
            results.push('task-4');
        }
    }
];

const queue = new Queue({concurrency: 2});
const stats = await queue.run(tasks);

console.log(`Completed: ${stats.completed}, Skipped: ${stats.skipped}, Errors: ${stats.errors.length}`);
if (stats.errors.length > 0) {
    console.log('Failed tasks:');
    for (const err of stats.errors) {
        console.log(`  - ${err.title}: ${err.error.message}`);
    }
}
console.log(`Results: ${results.join(', ')}`);
