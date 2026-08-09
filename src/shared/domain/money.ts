export function formatMinorUnits(
	amount: number,
	locale = "en-IN",
	currency = "INR",
): string {
	if (!Number.isSafeInteger(amount)) {
		throw new TypeError("amount must be an integer");
	}

	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		minimumFractionDigits: 2,
	}).format(amount / 100);
}
