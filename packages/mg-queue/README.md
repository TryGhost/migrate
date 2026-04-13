# mg-queue

A concurrent task queue with progress rendering for migrations.

## Install

```bash
pnpm add @tryghost/mg-queue
```

`mg-queue` includes SQLite support via `better-sqlite3` (native module).

## Usage

### Basic Example (Silent Mode)

No renderer - tasks run silently and stats are returned:

```typescript
import {Queue, Task} from '@tryghost/mg-queue';

const tasks: Task[] = [
    {title: 'Task 1', task: async () => { /* ... */ }},
    {title: 'Task 2', task: async () => { /* ... */ }}
];

const queue = new Queue({concurrency: 5});
const stats = await queue.run(tasks);

// stats = {
//     completed: 1,
//     skipped: 0,
//     errors: [{title: 'Task 1', error: Error}]
// }

console.log(`Completed: ${stats.completed}, Skipped: ${stats.skipped}`);

if (stats.errors.length > 0) {
    console.log('Failed tasks:');
    for (const err of stats.errors) {
        console.log(`  ${err.title}: ${err.error.message}`);
    }
}
```

### Verbose Renderer

Logs every task start, complete, skip, and error as they happen:

```typescript
import {Queue, Task} from '@tryghost/mg-queue';

const tasks: Task[] = [
    {title: 'Download file', task: async () => { /* ... */ }},
    {title: 'Process data', task: async () => { /* ... */ }}
];

const queue = new Queue({
    concurrency: 2,
    renderer: 'verbose'
});

await queue.run(tasks);
```

Output:
```
→ Starting: Download file
→ Starting: Process data
✓ Completed: Download file
✓ Completed: Process data

Completed: 2 | Failed: 0
```

### Dynamic Renderer

Single updating line with spinner - ideal for many tasks:

```typescript
import {Queue, Task} from '@tryghost/mg-queue';

async function* generateTasks(): AsyncGenerator<Task> {
    for (let i = 1; i <= 100; i++) {
        yield {
            title: `Task ${i}`,
            task: async () => { /* ... */ }
        };
    }
}

const queue = new Queue({
    concurrency: 5,
    renderer: 'dynamic'
});

await queue.run(generateTasks());
```

Keep completed tasks visible while new tasks continue:

```typescript
const queue = new Queue({
    concurrency: 5,
    renderer: new DynamicRenderer({keepOnScreen: true})
});
```

`keepOnScreen` is applied only when the source passed to `queue.run(...)` is a plain array.
In this mode, only depth-0 tasks persist on screen; subtasks are shown while active and collapse after completion.

Example live output:
```
✓ Uppercasing titles
⠹ Adding content
  ⠹ Processing Post 1
  ⠹ Processing Post 2
- Saving files
✓ 42
```

When the queue source is an array, upcoming root tasks are shown as `- Task` until they start.
When the source is a generator/async generator, upcoming tasks are not pre-rendered.

Output (updates in place):
```
⠋ Task 42
⠋ Task 43
⠋ Task 44
✓ 41 | ⊘ 2 | ✗ 1
```

Final output:
```
✓ 97 | ⊘ 2 | ✗ 1 failed

✗ Task 25
  Error: Something went wrong

✗ Task 50
  Error: Connection timeout
```

## SQLite Reader

Use `SqliteReader` when you iterate SQLite rows to create queue tasks and/or need to write progress back to those rows.

### Stream Rows as Queue Tasks

```typescript
import {Queue, SqliteReader, Task} from '@tryghost/mg-queue';

const reader = new SqliteReader({dbPath: './posts.db'});
await reader.configureForConcurrentAccess();

async function* rowsToTasks(batchSize = 1000): AsyncGenerator<Task> {
    for await (const row of reader.streamRowsById({
        table: 'posts',
        columns: ['title', 'body'], // id is auto-selected for paging
        batchSize
    })) {
        const id = Number(row.id);

        yield {
            title: `Row ${id}: ${row.title}`,
            task: async () => {
                // ... process row ...

                await reader.updateRowById({
                    table: 'posts',
                    id,
                    values: {
                        title: row.title.toUpperCase()
                    }
                });
            }
        };
    }
}

const queue = new Queue({
    concurrency: 2,
    // Optional: defaults to 250
    yieldEvery: 250,
    renderer: 'dynamic'
});

try {
    const stats = await queue.run(rowsToTasks(2000));
    console.log(`Done: ${stats.completed} completed, ${stats.errors.length} failed`);
} finally {
    reader.close();
}
```

### Batch Row Updates (Single Transaction)

```typescript
await reader.updateRowsById({
    table: 'posts',
    rows: [
        {id: 1, values: {status: 'processed', attempts: 1}},
        {id: 2, values: {status: 'processed', attempts: 1}}
    ]
});
```

`updateRowsById` wraps updates in `BEGIN`/`COMMIT` and rolls back on failure.

## Skipping Tasks

### Pre-execution Skip

Skip tasks before they run using a boolean or function:

```typescript
const tasks: Task[] = [
    {
        title: 'Already done',
        skip: true,  // Always skip
        task: async () => { /* ... */ }
    },
    {
        title: 'Conditional',
        skip: () => fs.existsSync('output.json'),  // Skip if file exists
        task: async () => { /* ... */ }
    },
    {
        title: 'Async check',
        skip: async () => {
            const resp = await fetch('...');
            return resp.status === 200;
        },
        task: async () => { /* ... */ }
    }
];
```

### In-execution Skip

Skip during task execution using the context:

```typescript
const tasks: Task[] = [
    {
        title: 'Process file',
        task: async (ctx) => {
            const data = await readFile('input.json');
            if (data.alreadyProcessed) {
                ctx.skip();  // Marks task as skipped, stops execution
            }
            // ... process data
        }
    }
];
```

## Task Timeout

Configure a timeout for all tasks in the queue. Tasks that exceed the timeout will fail with a `TimeoutError`:

```typescript
import {Queue, Task, TimeoutError} from '@tryghost/mg-queue';

const tasks: Task[] = [
    {title: 'Fast task', task: async () => { /* completes in 100ms */ }},
    {title: 'Slow task', task: async () => { /* takes 10 seconds */ }}
];

const queue = new Queue({
    concurrency: 5,
    timeout: 5000,  // 5 second timeout
    renderer: 'verbose'
});

try {
    await queue.run(tasks);
} catch (err) {
    if (err instanceof AggregateError) {
        for (const taskErr of err.errors) {
            if (taskErr.cause instanceof TimeoutError) {
                console.log(`${taskErr.task} timed out after ${taskErr.cause.timeout}ms`);
            }
        }
    }
}
```

## Cooperative Cancellation with AbortSignal

When a task times out, the `ctx.signal` is aborted, allowing tasks to clean up or stop work early. This is especially useful for long-running operations like network requests:

```typescript
const tasks: Task[] = [
    {
        title: 'Fetch data',
        task: async (ctx) => {
            // fetch() automatically aborts when signal is triggered
            const response = await fetch('https://api.example.com/data', {
                signal: ctx.signal
            });
            return response.json();
        }
    },
    {
        title: 'Long polling',
        task: async (ctx) => {
            // Check signal in loops for cooperative cancellation
            while (!ctx.signal.aborted) {
                const data = await pollOnce();
                if (data.complete) break;
                await delay(1000);
            }
        }
    },
    {
        title: 'Custom cleanup',
        task: async (ctx) => {
            const connection = await openConnection();

            // Register cleanup handler
            ctx.signal.addEventListener('abort', () => {
                connection.close();
            });

            await processData(connection);
        }
    }
];

const queue = new Queue({
    concurrency: 3,
    timeout: 30000  // 30 second timeout
});
```

The signal is also available when no timeout is set - it simply won't be aborted automatically.

## Subtasks

Tasks can dynamically generate subtasks by returning a `Subtasks` instance:

```typescript
import {Queue, Task, Subtasks} from '@tryghost/mg-queue';

const tasks: Task[] = [
    {
        title: 'Download files (parallel)',
        task: async () => {
            const files = await fetchFileList();
            // Parallel execution using queue's concurrency
            return new Subtasks(files.map(f => ({
                title: `Download ${f.name}`,
                task: async () => { await download(f); }
            })));
        }
    },
    {
        title: 'Process files (sequential)',
        task: async () => {
            // Sequential execution
            return new Subtasks([
                {title: 'Step 1: Validate', task: async () => { /* ... */ }},
                {title: 'Step 2: Transform', task: async () => { /* ... */ }},
                {title: 'Step 3: Save', task: async () => { /* ... */ }}
            ], {sequential: true});
        }
    },
    {
        title: 'API calls (rate limited)',
        task: async () => {
            // Custom concurrency and timeout for subtasks
            return new Subtasks(
                apiEndpoints.map(url => ({
                    title: `Fetch ${url}`,
                    task: async () => { await fetch(url); }
                })),
                {concurrency: 2, timeout: 5000}
            );
        }
    }
];
```

Output with VerboseRenderer:
```
[STARTING] Download files (parallel)
  [STARTING] Download image1.jpg
  [STARTING] Download image2.jpg
  [COMPLETED] Download image1.jpg
  [COMPLETED] Download image2.jpg
[COMPLETED] Download files (parallel)
[STARTING] Process files (sequential)
  [STARTING] Step 1: Validate
  [COMPLETED] Step 1: Validate
  [STARTING] Step 2: Transform
  [COMPLETED] Step 2: Transform
  [STARTING] Step 3: Save
  [COMPLETED] Step 3: Save
[COMPLETED] Process files (sequential)
```

Subtasks can be nested to any depth. If any subtask fails, the parent task is marked as failed, but other subtasks continue processing.

## API

### Queue

```typescript
new Queue(options: QueueOptions)
```

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `concurrency` | `number` | Yes | — | Maximum number of tasks to run concurrently |
| `renderer` | `BuiltInRenderer \| Renderer` | No | `'silent'` | A built-in renderer name (`'silent'`, `'verbose'`, `'dynamic'`) or a custom `Renderer` instance |
| `timeout` | `number` | No | No timeout | Timeout in milliseconds for each task. Tasks exceeding this fail with `TimeoutError` |
| `yieldEvery` | `number` | No | `250` | Yield to the event loop every N settled tasks. Useful for smooth rendering with synchronous work |

Methods:
- `run(tasks): Promise<QueueStats>` - Execute tasks and return stats (never throws on task errors)

### Task

```typescript
interface Task {
    title: string;
    skip?: boolean | (() => boolean | Promise<boolean>);
    task: (ctx: TaskContext) => Promise<void | Subtasks>;
}
```

| Property | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | Yes | Display name for the task, shown in renderer output and error reports |
| `skip` | `boolean \| () => boolean \| Promise<boolean>` | No | Skip this task. `true` always skips; a function is evaluated before the task runs |
| `task` | `(ctx: TaskContext) => Promise<void \| Subtasks>` | Yes | The async function to execute. Receives a `TaskContext` for skipping and abort signalling. Return a `Subtasks` instance to spawn child tasks |

### Subtasks

Wrapper for returning subtasks with execution options:

```typescript
new Subtasks(tasks: Task[], options?: SubtasksOptions)

interface SubtasksOptions {
    sequential?: boolean;   // Run subtasks one at a time (shorthand for concurrency: 1)
    concurrency?: number;   // Max concurrent subtasks (default: inherits from queue)
    timeout?: number;       // Timeout per subtask in ms (default: inherits from queue)
}
```

### TaskContext

```typescript
interface TaskContext {
    skip(): void;       // Call to skip the current task
    signal: AbortSignal; // Aborted when task times out
}
```

### TaskInfo

Passed to renderer callbacks:

```typescript
interface TaskInfo {
    title: string;
    depth: number;  // 0 = root, 1 = subtask, 2 = nested subtask, etc.
}
```

### QueueStats

Returned from `queue.run()` and passed to renderer's `onQueueEnd`:

```typescript
interface QueueStats {
    completed: number;
    skipped: number;
    errors: Array<{title: string; error: Error}>;
}
```

### SqliteReader

```typescript
new SqliteReader(options: SqliteReaderOptions)
```

Options:
- `dbPath: string` - Path to SQLite database file
- `timeoutMs?: number` - SQLite busy timeout in milliseconds (default: `5000`)
- `readonly?: boolean` - Open connection in readonly mode
- `database?: SqliteDatabase` - Inject existing DB instance (useful for tests)

Methods:
- `configureForConcurrentAccess(): Promise<void>` - Sets `journal_mode=WAL` and `synchronous=NORMAL`
- `streamRowsById(options): AsyncGenerator<SqliteRow>` - Streams rows in `id` order using batched pagination
- `updateRowById(options): Promise<void>` - Updates one row by ID with bound parameters
- `updateRowsById(options): Promise<void>` - Updates many rows in one transaction
- `execute(sql): Promise<void>` - Execute raw SQL
- `close(): void` - Close owned DB connection

## Examples

The [examples/](examples/) directory contains runnable scripts, each demonstrating a single feature:

- **verbose-renderer.ts** — Concurrent tasks with the verbose renderer
- **dynamic-renderer.ts** — 20k tasks with the live-updating dynamic renderer
- **silent-mode.ts** — No renderer, inspecting `QueueStats` directly
- **skip.ts** — Boolean, sync/async, and in-execution skip patterns
- **timeout.ts** — Queue-wide timeout with `TimeoutError`
- **subtasks.ts** — Parallel and sequential child tasks via `Subtasks`
- **abort-signal.ts** — Cooperative cancellation with `ctx.signal`
- **sqlite-reader.ts** — Streaming SQLite rows as queue tasks
- **mg-context.ts** — Reading from an mg-context database with SqliteReader
- **other.ts** — Minimal end-to-end with dynamic renderer and task hierarchy

Run any example from the package directory:

```bash
npx tsx examples/verbose-renderer.ts
```

## Test

- `pnpm lint` run just eslint
- `pnpm test` run lint and tests

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
