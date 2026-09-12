function wallClockAsUtc(timezone: string, date: Date): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
	return Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
}

function offsetAt(timezone: string, utcMs: number): number {
	return wallClockAsUtc(timezone, new Date(utcMs)) - utcMs;
}

/**
 * Returns the UTC millisecond timestamp at which the store's local day begins
 * for the given instant. Two passes resolve DST-transition days correctly.
 */
export function startOfLocalDayUtc(timezone: string, now: Date): number {
	const local = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const [year, month, day] = local.split("-").map(Number);
	const wallMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
	let utc = wallMidnight - offsetAt(timezone, wallMidnight);
	utc = wallMidnight - offsetAt(timezone, utc);
	return utc;
}
