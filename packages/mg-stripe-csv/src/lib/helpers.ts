export function dateToUnix(date?: Date | null) {
    if (!date) {
        return
    }
    return Math.floor(date.getTime() / 1000);
}
