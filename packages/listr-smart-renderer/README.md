# Listr Smart Renderer

A renderer for [Listr](https://github.com/SamVerschueren/listr) & [listr2](https://github.com/cenk1cenk2/listr2) that handles extremely long lists of tasks by collapsing into a summary view.

Pass in `maxFullTasks` to tell the renderer when to collapse into summary view.
The summary outputs one line for each task that is currently being executed, one line for each task that fails and a final summary line.

Heavily based on [listr-update-renderer](https://github.com/SamVerschueren/listr-update-renderer), with all the same nice UI features.


## Install

`npm install @tryghost/listr-smart-renderer --save`

or

`yarn add @tryghost/listr-smart-renderer`


## Usage

```js
// Either of these 2 will work
import Listr from 'listr';
import {Listr} from 'listr2';
import SmartRenderer from '@tryghost/listr-smart-renderer';

const list = new Listr([
    {
        title: 'foo',
        task: () => Promise.resolve('bar')
    }
], {
    renderer: SmartRenderer,
	maxFullTasks: 10
});

list.run();
```

This package also exports a `makeTaskRunner` method that simplifies your script. `listr2` is used here.

```js
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';

let tasks = [
    {
        title: 'Do some thing',
        task: async (ctx) => {
            // Things here
        }
    },
    {
        title: 'Do more thing',
        task: async (ctx) => {
            // more here
        }
    }
];

let taskRunner = makeTaskRunner(tasks);

await taskRunner.run();
```

## Options

These options should be provided in the[Listr](https://github.com/SamVerschueren/listr) or [listr2](https://listr2.kilic.dev/getting-started/task-object) options object.

### maxFullTasks

Type: `number`<br>
Default: `30`

How many tasks to output in "full" mode before collapsing to summary mode.

### clearOutput

Type: `boolean`<br>
Default: `false`

Clear the output when all the tasks are executed successfully.


## Related

- [listr](https://github.com/SamVerschueren/listr) - Terminal task list
- [listr-verbose-renderer](https://github.com/SamVerschueren/listr-verbose-renderer) - Listr verbose renderer


## Develop

This is a mono repository, managed with [lerna](https://lernajs.io/).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

- `yarn dev`


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests

# Copyright & License

Copyright (c) 2013-2023 Ghost Foundation, Sam Verschueren - Released under the [MIT license](LICENSE).
