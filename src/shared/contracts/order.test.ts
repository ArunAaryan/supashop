import { describe, expect, it } from "vitest";

import {
	checkoutInputSchema,
	customerAddressInputSchema,
	deleteCustomerAddressInputSchema,
	orderDetailSchema,
	orderSchema,
} from "./order";

const address = {
	recipientName: " Arun Kumar ",
	mobile: " +919876543210 ",
	addressLine1: " 10 Market Street ",
	addressLine2: "",
	landmark: "",
	city: " Bengaluru ",
	state: " Karnataka ",
	postalCode: " 560001 ",
	latitude: null,
	longitude: null,
	deliveryInstructions: " Leave with security ",
};

describe("order contracts", () => {
	it("normalizes reusable delivery addresses and requires complete coordinates", () => {
		expect(customerAddressInputSchema.parse({ ...address, label: " Home ", isDefault: true })).toMatchObject({
			label: "Home", recipientName: "Arun Kumar", mobile: "+919876543210", postalCode: "560001", isDefault: true,
		});
		expect(customerAddressInputSchema.safeParse({ ...address, latitude: 12.9 }).success).toBe(false);
		expect(customerAddressInputSchema.safeParse({ ...address, mobile: "9876543210" }).success).toBe(false);
	});

	it("requires a reviewed, unique cart snapshot without accepting idempotency keys in the body", () => {
		const valid = {
			deliveryAddress: address,
			expectedLines: [{ offeringId: "offering-1", quantity: 2, expectedUnitPriceMinor: 450, offeringVersion: 3 }],
			cartUpdatedAt: 123,
			saveAddress: false,
		};
		expect(checkoutInputSchema.parse(valid)).toMatchObject({ expectedLines: [{ expectedUnitPriceMinor: 450, offeringVersion: 3 }] });
		expect(checkoutInputSchema.safeParse({ ...valid, idempotencyKey: "client-must-use-header" }).success).toBe(false);
		expect(checkoutInputSchema.safeParse({ ...valid, expectedLines: [...valid.expectedLines, valid.expectedLines[0]] }).success).toBe(false);
	});

	it("requires a version on address deletion", () => {
		expect(deleteCustomerAddressInputSchema.safeParse({}).success).toBe(false);
		expect(deleteCustomerAddressInputSchema.parse({ version: 2 })).toEqual({ version: 2 });
	});

	it("enforces opaque order numbers and immutable price totals", () => {
		const order = {
			id: "order-1", orderNumber: "ord_u5NrWL4i6aQYVbScRM5T7z_e", status: "placed", paymentStatus: "pending", currency: "INR",
			subtotalMinor: 900, deliveryFeeMinor: 50, totalMinor: 950, itemCount: 2, placedAt: 123, expectedDeliveryAt: null, cancelledAt: null, customerCanCancel: true, version: 1,
		};
		expect(orderSchema.parse(order)).toEqual(order);
		expect(orderSchema.safeParse({ ...order, totalMinor: 999 }).success).toBe(false);
		expect(orderSchema.safeParse({ ...order, orderNumber: "42" }).success).toBe(false);
	});

	it("requires order item snapshot arithmetic to produce the order subtotal", () => {
		const detail = {
			id: "order-1", orderNumber: "ord_u5NrWL4i6aQYVbScRM5T7z_e", status: "placed", paymentStatus: "pending", currency: "INR",
			subtotalMinor: 900, deliveryFeeMinor: 50, totalMinor: 950, itemCount: 2, placedAt: 123, expectedDeliveryAt: null, cancelledAt: null, customerCanCancel: true, version: 1,
			address: { orderId: "order-1", ...address },
			items: [{ offeringId: "offering-1", productId: "product-1", productCode: "MILK-1", productName: "Milk", offeringSku: "MILK-1L", offeringLabel: "1 litre", packQuantity: 1, weightValue: null, weightUnit: null, listPriceMinor: 500, discountType: "fixed", discountValue: 50, effectiveUnitPriceMinor: 450, quantity: 2, lineTotalMinor: 900 }],
			statusHistory: [{ id: "history-1", fromStatus: null, toStatus: "placed", reason: null, actorUserId: null, createdAt: 123 }],
		};
		expect(orderDetailSchema.parse(detail)).toMatchObject({ subtotalMinor: 900 });
		expect(orderDetailSchema.safeParse({ ...detail, subtotalMinor: 899, totalMinor: 949 }).success).toBe(false);
	});
});
