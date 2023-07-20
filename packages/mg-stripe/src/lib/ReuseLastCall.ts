export class ReuseLastCall<T> {
    jobs: Map<string, Promise<T>> = new Map();

    async schedule(id: string, job: () => Promise<T>): Promise<T> {
        // Check if running:
        const existingJob = this.jobs.get(id);
        if (existingJob) {
            return existingJob;
        }

        const promise = new Promise<T>((resolve, reject) => {
            job().then(resolve).catch(reject);
        });
        this.jobs.set(id, promise);
        const v = await promise;
        this.jobs.delete(id);
        return v;
    }
}
