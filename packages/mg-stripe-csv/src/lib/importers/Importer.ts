import Logger from "../Logger.js"
import {isWarning} from "../helpers.js"
import {ErrorGroup} from "./ErrorGroup.js"
import {ImportError} from "./ImportError.js"
import {ImportStats} from "./ImportStats.js"
import {ImportWarning} from "./ImportWarning.js"

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

    listeners: ((error?: Error) => void)[] = []

    addListener(listener: () => void) {
        this.listeners.push(listener)
    }

    removeListener(listener: () => void) {
        this.listeners = this.listeners.filter(l => l !== listener)
    }

    callListeners(error?: Error) {
        for (const listener of this.listeners) {
            listener(error)
            if (error) {
                // Prevent propagating the error to other listeners
                error = undefined
            }
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
            task().catch(e => {
                this.callListeners(e)
            }).then(() => {
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
        return new Promise<void>((resolve, reject) => {
            const listener = (error?: Error) => {
                if (error) {
                    this.removeListener(listener)
                    reject(error)
                    return;
                }
                if (this.runningTasks === 0) {
                    this.removeListener(listener)
                    resolve()
                }
            }
            this.addListener(listener)
            listener();
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
     * @returns An ErrorGroup if there were only warnings
     */
    async recreateAll(): Promise<ErrorGroup|undefined> {
        const groupErrors = false;

        // Loop through all items in the provider and import them
        const queue = new Queue();
        const errorGroup = new ErrorGroup();
        for await (const item of this.provider.getAll()) {
            queue.add(async () => {
                try {
                    await this.recreate(item);
                } catch (e: any) {
                    if (!groupErrors) {
                        if (isWarning(e)) {
                            errorGroup.add(e)
                            return
                        }
                        throw e
                    }
                    if (isWarning(e)) {
                        Logger.shared.warn(e.toString())
                    } else {
                        Logger.shared.error(e.toString())
                    }
                    errorGroup.add(e)
                }
            });
        }
        await queue.waitUntilFinished()
        errorGroup.throwIfNotEmpty()

        return errorGroup.isEmpty ? undefined : errorGroup
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
            Logger.vv?.info(`Skipped ${this.objectName} ${id}, because already recreated as ${alreadyRecreatedId} in this run`);
            return alreadyRecreatedId
        }

        const item = await this.provider.getByID(id);
        return await this.recreate(item);
    }

    async recreate(item: T): Promise<string> {
        // Check if already imported
        // We need to repeat this because sometimes the item is passed directly to this method, without going through recreateByID()
        const alreadyRecreatedId = this.recreatedMap.get(item.id);
        if (alreadyRecreatedId) {
            Logger.vv?.info(`Skipped ${this.objectName} ${item.id}, because already recreated as ${alreadyRecreatedId} in this run`);
            return alreadyRecreatedId
        }

        // To make sure the operation is idempotent, we first check if the item was already recreated in a previous run.
        const reuse = await this.provider.findExisting(item.id);
        if (reuse) {
            Logger.vv?.info(`Skipped ${this.objectName} ${item.id} because already recreated as ${reuse} in a previous run`);
            this.stats.trackReused(this.objectName)
            return reuse;
        }

        // Import
        Logger.vv?.info(`Recreating ${this.objectName} ${item.id}...`);

        let newID: string;
        try {
            newID = await this.provider.recreate(item);
        } catch (e: any) {
            if (e instanceof ImportWarning) {
                throw new ImportWarning({
                    message: 'Failed to recreate ' + this.objectName + ' ' + item.id,
                    cause: e,
                })
            }
            throw new ImportError({
                message: 'Failed to recreate ' + this.objectName + ' ' + item.id,
                cause: e,
            })
        }

        this.recreatedMap.set(item.id, newID);
        Logger.v?.ok(`Recreated ${this.objectName} ${item.id} as ${newID} in new account`);
        this.stats.trackImported(this.objectName)
        return newID;
    }
}
