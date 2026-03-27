export interface QueueStats {
    completed: number;
    skipped: number;
    errors: Array<{title: string; error: Error}>;
}

export interface TaskInfo {
    title: string;
    depth: number;
    parentTitle?: string;
    taskId?: number;
}

export interface Renderer {
    onTaskPending?(info: TaskInfo): void;
    onTaskStart(info: TaskInfo): void;
    onTaskComplete(info: TaskInfo): void;
    onTaskError(info: TaskInfo, error: Error): void;
    onTaskSkip(info: TaskInfo): void;
    onQueueEnd(stats: QueueStats): void;
}
