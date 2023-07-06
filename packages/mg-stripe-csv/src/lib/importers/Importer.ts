import Logger from "../Logger.js"
import {ImportStats} from "./ImportStats.js"

export type ImportProvider<T> = {
    /**
     *
     */
    getByID(oldId: string): Promise<T>
    getAll(): {[Symbol.asyncIterator](): AsyncIterator<T>}

    /**
     * Find the newID for a given oldID, in case the oldID was already imported previously in another run.
     */
    findExisting(oldId: string): Promise<string|undefined>

    /**
     * Recreate an existing item in the new account.
     */
    recreate(oldItem: T): Promise<string>
}

export class Queue {
    runningTasks = 0;
    maxRunningTasks = 4;
    waitingTasks = 0;
    queue: (() => Promise<void>)[] = []

    listeners: (() => void)[] = []

    addListener(listener: () => void) {
        this.listeners.push(listener)
    }

    removeListener(listener: () => void) {
        this.listeners = this.listeners.filter(l => l !== listener)
    }

    callListeners() {
        for (const listener of this.listeners) {
            listener()
        }
    }

    /**
     * Queue a task and returns immediately. If the queue is full, it will block until a task is finished and a slot is available.
     */
    async add(task: () => Promise<void>) {
        this.queue.push(task)
        this.runNext()
    }

    runNext() {
        if (this.runningTasks >= this.maxRunningTasks) {
            return
        }

        const task = this.queue.shift()
        if (task) {
            this.runningTasks++
            task().finally(() => {
                this.runningTasks--

                // Run next
                this.runNext()
            });
        } else {
            // Call listeners
            this.callListeners()
        }
    }

    async waitUntilFinished() {
        return new Promise<void>(resolve => {
            const listener = () => {
                if (this.runningTasks === 0) {
                    this.removeListener(listener)
                    resolve()
                }
            }
            this.addListener(listener)
        });
    }
}

export class Importer<T extends {id: string}> {
    objectName: string;
    stats: ImportStats
    provider: ImportProvider<T>;
    recreatedMap: Map<string, string> = new Map();

    constructor(options: {objectName: string, provider: ImportProvider<T>, stats: ImportStats}) {
        this.objectName = options.objectName;
        this.provider = options.provider;
        this.stats = options.stats;
    }

    /**
     * Loop through all the available items in the old account, and recreate them in the new account.
     */
    async recreateAll(): Promise<void> {
        // Loop through all items in the provider and import them
        const queue = new Queue();
        for await (const item of this.provider.getAll()) {
            queue.add(async () => {
                await this.recreate(item);
            });
        }
        await queue.waitUntilFinished()
    }

    async recreateByObjectOrId(idOrItem: string | T) {
        if (typeof idOrItem === 'string') {
            return await this.recreateByID(idOrItem)
        } else {
            return await this.recreate(idOrItem)
        }
    }

    async recreateByID(id: string): Promise<string> {
        // Check if already imported
        const alreadyRecreatedId = this.recreatedMap.get(id);
        if (alreadyRecreatedId) {
            Logger.vv.info(`Skipped ${this.objectName} ${id}, because already recreated as ${alreadyRecreatedId} in this run`);
            return alreadyRecreatedId
        }

        const item = await this.provider.getByID(id);
        return await this.recreate(item);
    }

    async recreate(item: T): Promise<string> {
        // Check if already imported
        const alreadyRecreatedId = this.recreatedMap.get(item.id);
        if (alreadyRecreatedId) {
            Logger.vv.info(`Skipped ${this.objectName} ${item.id}, because already recreated as ${alreadyRecreatedId} in this run`);
            return alreadyRecreatedId
        }

        // To make sure the operation is idempotent, we first check if the item was already recreated in a previous run.
        const reuse = await this.provider.findExisting(item.id);
        if (reuse) {
            Logger.vv.info(`Skipped ${this.objectName} ${item.id} because already recreated as ${reuse} in a previous run`);
            this.stats.trackReused(this.objectName)
            return reuse;
        }

        // Import
        Logger.vv.info(`Recreating ${this.objectName} ${item.id}...`);
        const newID = await this.provider.recreate(item);
        this.recreatedMap.set(item.id, newID);
        Logger.v.ok(`Recreated ${this.objectName} ${item.id} as ${newID} in new account`);
        this.stats.trackImported(this.objectName)
        return newID;
    }
}
