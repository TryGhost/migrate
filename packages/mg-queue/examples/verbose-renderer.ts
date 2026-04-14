// Run from the packages/mg-queue/ directory:
//   npx tsx examples/verbose-renderer.ts
/* eslint-disable no-console */
import {Queue, Task, VerboseRenderer} from '../src/index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const tasks: Task[] = [
    {
        title: 'Download image 1',
        task: async () => {
            await delay(100);
        }
    },
    {
        title: 'Download image 2',
        task: async () => {
            await delay(150);
        }
    },
    {
        title: 'Download image 3 (will fail)',
        task: async () => {
            await delay(50);
            throw new Error('Network timeout');
        }
    },
    {
        title: 'Download image 4',
        task: async () => {
            await delay(80);
        }
    }
];

const queue = new Queue({
    concurrency: 2,
    renderer: new VerboseRenderer()
});

await queue.run(tasks);
