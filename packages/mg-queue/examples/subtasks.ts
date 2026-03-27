// Run from the packages/mg-queue/ directory:
//   npx tsx examples/subtasks.ts
/* eslint-disable no-console */
import {Queue, Task, VerboseRenderer, Subtasks} from '../src/index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const files = ['image1.jpg', 'image2.jpg', 'image3.jpg'];

const tasks: Task[] = [
    {
        title: 'Download files (parallel)',
        task: async () => {
            return new Subtasks(files.map(f => ({
                title: `Download ${f}`,
                task: async () => {
                    await delay(50 + Math.random() * 100);
                }
            })));
        }
    },
    {
        title: 'Process files (sequential)',
        task: async () => {
            return new Subtasks([
                {
                    title: 'Step 1: Validate',
                    task: async () => {
                        await delay(50);
                    }
                },
                {
                    title: 'Step 2: Transform',
                    task: async () => {
                        await delay(50);
                    }
                },
                {
                    title: 'Step 3: Save',
                    task: async () => {
                        await delay(50);
                    }
                }
            ], {sequential: true});
        }
    }
];

const queue = new Queue({
    concurrency: 3,
    renderer: new VerboseRenderer()
});

await queue.run(tasks);
