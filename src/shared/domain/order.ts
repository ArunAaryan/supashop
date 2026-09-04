export const orderStatusValues = [
	"placed",
	"confirmed",
	"preparing",
	"ready",
	"out_for_delivery",
	"delivered",
	"cancelled",
	"rejected",
] as const;

export type OrderStatus = (typeof orderStatusValues)[number];

export const paymentStatusValues = ["pending", "collected", "exception"] as const;
export type PaymentStatus = (typeof paymentStatusValues)[number];

export const inventoryMovementTypeValues = [
	"manual_adjustment",
	"checkout_deduction",
	"cancellation_restoration",
] as const;

export type InventoryMovementType = (typeof inventoryMovementTypeValues)[number];

export function canCustomerCancelOrder(status: OrderStatus): boolean {
	return status === "placed" || status === "confirmed";
}

export function calculateOrderTotal(subtotalMinor: number, deliveryFeeMinor: number): number {
	return subtotalMinor + deliveryFeeMinor;
}

export function isOpaqueOrderNumber(value: string): boolean {
	return /^ord_[A-Za-z0-9_-]{20,128}$/.test(value);
}
