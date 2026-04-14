// Run from the packages/mg-queue/ directory:
//   npx tsx examples/dynamic-renderer.ts
/* eslint-disable no-console */
import {Queue, Task, DynamicRenderer, Subtasks} from '../src/index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function* generateTasks(count: number): AsyncGenerator<Task> {
    for (let i = 1; i <= count; i += 1) {
        yield {
            title: `Task ${i}`,
            task: async () => {
                await delay(1 + Math.random());
                if (i === 13 || i === 37 || i === 88) {
                    await delay(2000 + Math.random() * 200);
                } else if (i === 30) {
                    const theSubTasks = [];
                    for (let ii = 1; ii <= 123; ii += 1) {
                        theSubTasks.push({
                            title: `Subtask ${i}.${ii}`,
                            task: async () => {
                                await delay(30 + Math.random() * 20);
                            }
                        });
                    }
                    return new Subtasks(theSubTasks, {
                        concurrency: 3
                    });
                } else if (i === 70) {
                    const theSubTasks = [];
                    for (let ii = 1; ii <= 234; ii += 1) {
                        theSubTasks.push({
                            title: `Subtask ${i}.${ii}`,
                            task: async () => {
                                await delay(10 + Math.random() * 20);
                            }
                        });
                    }
                    return new Subtasks(theSubTasks, {
                        sequential: true
                    });
                } else {
                    await delay(1 + Math.random());
                }
            }
        };
    }
}

const queue = new Queue({
    concurrency: 10,
    renderer: new DynamicRenderer({
        keepOnScreen: true
    })
});

await queue.run(generateTasks(20000));
