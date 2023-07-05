import {Data} from "./Data.js";

export class DecodeError extends Error {
    dataContext: Data

    constructor(message: string, dataContext: Data) {
        super(dataContext.path.length === 0 ? message : `${message} at ${dataContext.path.join('.')}`);
        this.dataContext = dataContext;
    }

    toString() {
        return this.message;
    }
}
