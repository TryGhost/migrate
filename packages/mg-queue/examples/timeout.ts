// Run from the packages/mg-queue/ directory:
//   npx tsx examples/timeout.ts
/* eslint-disable no-console */
import {Queue, Task, VerboseRenderer, TimeoutError} from '../src/index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const tasks: Task[] = [
    {
        title: 'Fast task (50ms)',
        task: async () => {
            await delay(50);
        }
    },
    {
        title: 'Slow task (will timeout)',
        task: async () => {
            await delay(500);
        }
    },
    {
        title: 'Medium task (100ms)',
        task: async () => {
            await delay(100);
        }
    }
];

const queue = new Queue({
    concurrency: 3,
    timeout: 200,
    renderer: new VerboseRenderer()
});

const stats = await queue.run(tasks);

if (stats.errors.length > 0) {
    console.log('\nTimeout errors:');
    for (const err of stats.errors) {
        if (err.error instanceof TimeoutError) {
            console.log(`  - ${err.title}: ${err.error.message}`);
        }
    }
}
