// Run from the packages/mg-queue/ directory:
//   npx tsx examples/skip.ts
/* eslint-disable no-console */
import {Queue, Task, VerboseRenderer} from '../src/index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const alreadyProcessed = true;

const tasks: Task[] = [
    // Pre-execution skip with boolean
    {
        title: 'Already completed task',
        skip: true,
        task: async () => {
            // This won't run
        }
    },
    // Pre-execution skip with sync function
    {
        title: 'Conditional skip (sync)',
        skip: () => alreadyProcessed,
        task: async () => {
            // This won't run because alreadyProcessed is true
        }
    },
    // Pre-execution skip with async function
    {
        title: 'Conditional skip (async)',
        skip: async () => {
            await delay(10);
            return false; // Will run
        },
        task: async () => {
            await delay(50);
        }
    },
    // In-execution skip via ctx.skip()
    {
        title: 'In-execution skip',
        task: async (ctx) => {
            const data = {alreadyProcessed: true};
            if (data.alreadyProcessed) {
                ctx.skip(); // Marks task as skipped, stops execution
            }
            // Code after ctx.skip() won't run
            await delay(100);
        }
    },
    // Normal task
    {
        title: 'Normal task',
        task: async () => {
            await delay(50);
        }
    }
];

const queue = new Queue({
    concurrency: 2,
    renderer: new VerboseRenderer()
});

await queue.run(tasks);
