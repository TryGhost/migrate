// Run from the packages/mg-queue/ directory:
//   npx tsx examples/other.ts
/* eslint-disable no-console */
import {Queue, Task, VerboseRenderer, DynamicRenderer, TimeoutError, Subtasks} from '../src/index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

// const tasks: Task[] = [
//     {title: 'Task 1', task: async () => { /* ... */ }},
//     {title: 'Task 2', task: async () => { /* ... */ }}
// ];

const tasks: Task[] = [];

let posts: any = [
    {
        id: 1,
        title: 'Post 1',
        body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
    },
    {
        id: 2,
        title: 'Post 2',
        body: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
    },
    {
        id: 3,
        title: 'Post 3',
        body: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'
    },
    {
        id: 4,
        title: 'Post 4',
        body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
    },
    {
        id: 5,
        title: 'Post 5',
        body: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
    },
    {
        id: 6,
        title: 'Post 6',
        body: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'
    }
];

tasks.push({
    title: 'Uppercasing titles',
    task: async () => {
        let subTasks: Task[] = [];

        for (const post of posts) {
            subTasks.push({
                title: `Processing ${post.title}`,
                task: async () => {
                    await delay(300);
                    post.title = post.title.toUpperCase();

                    if (post.id === 3) {
                        throw new Error('Something went wrong!');
                    }
                }
            });
        }

        return new Subtasks(subTasks, {
            concurrency: 3
        });
    }
});

tasks.push({
    title: 'Doing a thing',
    task: async () => {
        await delay(1000);
    }
});

tasks.push({
    title: 'Wrapping body in HTML tags',
    task: async () => {
        let subTasks: Task[] = [];

        for (const post of posts) {
            subTasks.push({
                title: `Processing ${post.title}`,
                task: async () => {
                    await delay(300);
                    post.body = `<p>${post.body}</p>`;
                }
            });
        }

        return new Subtasks(subTasks, {
            concurrency: 3
        });
    }
});

tasks.push({
    title: 'Saving file',
    task: async () => {
        await delay(1000);
    }
});

const queue = new Queue({
    concurrency: 1,
    renderer: new DynamicRenderer({
        keepOnScreen: true
    })
});
const stats = await queue.run(tasks);

console.log(posts);
console.log('- - - - -');
console.log(stats);

