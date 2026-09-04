export type FulfillmentStore = {
	timezone: string;
	orderCutoffMinutes: number | null;
	hours: Array<{ weekday: number; opensMinute: number; closesMinute: number; closed: boolean }>;
	serviceablePostalCodes: string[];
	closures?: Array<{ startsOn: string; endsOn: string }>;
};

export type FulfillmentAvailabilityReason =
	| "available"
	| "store_not_configured"
	| "unserviceable_postal_code"
	| "store_closed"
	| "order_cutoff_passed";

export type FulfillmentAvailability = {
	available: boolean;
	reason: FulfillmentAvailabilityReason;
	localDate: string | null;
};

const weekdayNumbers: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

function localParts(timezone: string, now: Date) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
	return {
		localDate: `${value("year")}-${value("month")}-${value("day")}`,
		weekday: weekdayNumbers[value("weekday")] ?? -1,
		minute: Number(value("hour")) * 60 + Number(value("minute")),
	};
}

export function evaluateFulfillmentAvailability(
	store: FulfillmentStore | null,
	postalCode: string,
	now = new Date(),
): FulfillmentAvailability {
	if (!store) return { available: false, reason: "store_not_configured", localDate: null };

	const normalizedPostalCode = postalCode.trim().toUpperCase();
	const local = localParts(store.timezone, now);
	if (!store.serviceablePostalCodes.includes(normalizedPostalCode)) {
		return { available: false, reason: "unserviceable_postal_code", localDate: local.localDate };
	}
	if (store.closures?.some((closure) => closure.startsOn <= local.localDate && closure.endsOn >= local.localDate)) {
		return { available: false, reason: "store_closed", localDate: local.localDate };
	}

	const hours = store.hours.find((entry) => entry.weekday === local.weekday);
	if (!hours || hours.closed || local.minute < hours.opensMinute || local.minute >= hours.closesMinute) {
		return { available: false, reason: "store_closed", localDate: local.localDate };
	}
	if (store.orderCutoffMinutes !== null && local.minute >= store.orderCutoffMinutes) {
		return { available: false, reason: "order_cutoff_passed", localDate: local.localDate };
	}
	return { available: true, reason: "available", localDate: local.localDate };
}
