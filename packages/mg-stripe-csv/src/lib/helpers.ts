import DryRunIdGenerator from "./DryRunIdGenerator.js";
import {Options} from "./Options.js";

export function dateToUnix(date?: Date | null) {
    if (!date) {
        return
    }
    return Math.floor(date.getTime() / 1000);
}

export function getObjectId(data: string | {id: string}): string {
    if (typeof data === 'string') {
        return data
    }
    return data.id
}

export async function ifDryRunJustReturnFakeId(live: () => Promise<string>): Promise<string> {
    if (Options.shared.dryRun) {
        return DryRunIdGenerator.getNext()
    }
    return await live()
}
