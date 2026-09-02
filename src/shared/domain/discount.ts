export const discountTypes = ["none", "fixed", "percentage"] as const;

export type DiscountType = (typeof discountTypes)[number];

export function calculateEffectivePrice(
	listPriceMinor: number,
	type: DiscountType,
	value: number,
): { discountMinor: number; effectivePriceMinor: number } {
	if (!Number.isSafeInteger(listPriceMinor) || listPriceMinor <= 0) {
		throw new RangeError("listPriceMinor must be a positive safe integer");
	}

	if (!Number.isSafeInteger(value)) {
		throw new RangeError("discount value must be a safe integer");
	}

	let discountMinor: number;
	if (type === "none") {
		if (value !== 0) {
			throw new RangeError("none discounts must have a value of zero");
		}
		discountMinor = 0;
	} else if (type === "fixed") {
		if (value < 0 || value >= listPriceMinor) {
			throw new RangeError("fixed discounts must be nonnegative and below the list price");
		}
		discountMinor = value;
	} else if (type === "percentage") {
		if (value < 1 || value > 10_000) {
			throw new RangeError("percentage discounts must be between 1 and 10000 basis points");
		}
		discountMinor = Number((BigInt(listPriceMinor) * BigInt(value)) / 10_000n);
	} else {
		throw new TypeError("unknown discount type");
	}

	return {
		discountMinor,
		effectivePriceMinor: listPriceMinor - discountMinor,
	};
}
