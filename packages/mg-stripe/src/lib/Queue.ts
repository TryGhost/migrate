export class Queue {
    runningTasks = 0;
    maxRunningTasks = 25;
    waitingTasks = 0;
    queue: (() => Promise<void>)[] = [];

    listeners: ((error?: Error) => void)[] = [];

    constructor({maxRunningTasks}: {maxRunningTasks?: number} = {}) {
        if (maxRunningTasks) {
            this.maxRunningTasks = maxRunningTasks;
        }
    }

    addListener(listener: () => void) {
        this.listeners.push(listener);
    }

    removeListener(listener: () => void) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    callListeners(error?: Error) {
        for (const listener of this.listeners) {
            listener(error);
            if (error) {
                // Prevent propagating the error to other listeners
                error = undefined;
            }
        }
    }

    /**
     * Queue a task and returns immediately. If the queue is full, it will block until a task is finished and a slot is available.
     */
    add(task: () => Promise<void>) {
        this.queue.push(task);
        this.runNext();
    }

    async addAndWait<T>(task: () => Promise<T>, delayUntilFreeing = 0): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.add(async () => {
                const startTime = Date.now();
                try {
                    const result = await task();
                    resolve(result);
                } catch (e) {
                    reject(e);
                    return;
                }
                const endTime = Date.now();
                if (delayUntilFreeing) {
                    const remainingTime = delayUntilFreeing - (endTime - startTime);
                    if (remainingTime > 0) {
                        await new Promise((r) => {
                            setTimeout(r, remainingTime);
                        });
                    }
                }
            });
        });
    }

    runNext() {
        if (this.runningTasks >= this.maxRunningTasks) {
            return;
        }

        const task = this.queue.shift();
        if (task) {
            this.runningTasks += 1;
            task().catch((e) => {
                this.callListeners(e);
            }).then(() => {
                this.runningTasks -= 1;

                // Run next
                this.runNext();
            });
        } else {
            // Call listeners
            this.callListeners();
        }
    }

    async waitUntilFinished() {
        return new Promise<void>((resolve, reject) => {
            const listener = (error?: Error) => {
                if (error) {
                    this.removeListener(listener);
                    reject(error);
                    return;
                }
                if (this.runningTasks === 0) {
                    this.removeListener(listener);
                    resolve();
                }
            };
            this.addListener(listener);
            listener();
        });
    }
}
