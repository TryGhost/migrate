import type {Renderer, TaskInfo, QueueStats} from './Renderer.js';

/* c8 ignore start -- all methods are intentional no-ops */
export class SilentRenderer implements Renderer {
    onTaskPending(_info: TaskInfo): void {}
    onTaskStart(_info: TaskInfo): void {}
    onTaskComplete(_info: TaskInfo): void {}
    onTaskError(_info: TaskInfo, _error: Error): void {}
    onTaskSkip(_info: TaskInfo): void {}
    onQueueEnd(_stats: QueueStats): void {}
}
/* c8 ignore stop */
