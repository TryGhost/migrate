// Run from the packages/mg-queue/ directory:
//   npx tsx examples/abort-signal.ts
/* eslint-disable no-console */
import {Queue, Task, VerboseRenderer, TimeoutError} from '../src/index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const tasks: Task[] = [
    {
        title: 'Fetch with cancellation support',
        task: async (ctx) => {
            // Simulate a fetch that respects AbortSignal
            // In real code: await fetch(url, { signal: ctx.signal })
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.log('    (fetch completed)');
                    resolve();
                }, 300);

                ctx.signal.addEventListener('abort', () => {
                    clearTimeout(timeout);
                    console.log('    (fetch aborted!)');
                    reject(new Error('Aborted'));
                });
            });
        }
    },
    {
        title: 'Long polling with abort check',
        task: async (ctx) => {
            // Check signal in a loop
            for (let i = 0; i < 10; i++) {
                if (ctx.signal.aborted) {
                    console.log('    (polling stopped due to abort)');
                    return;
                }
                await delay(50);
            }
            console.log('    (polling completed)');
        }
    },
    {
        title: 'Task that will timeout',
        task: async (ctx) => {
            // This task takes too long and will be aborted
            ctx.signal.addEventListener('abort', () => {
                console.log('    (slow task received abort signal)');
            });
            await delay(500); // Longer than the 200ms timeout
        }
    }
];

const queue = new Queue({
    concurrency: 1,
    timeout: 200,
    renderer: new VerboseRenderer()
});

const stats = await queue.run(tasks);

if (stats.errors.length > 0) {
    console.log('\nTasks that timed out:');
    for (const err of stats.errors) {
        if (err.error instanceof TimeoutError) {
            console.log(`  - ${err.title}`);
        }
    }
}
