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
