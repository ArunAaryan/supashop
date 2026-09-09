import { z } from "zod";

import {
	calculateOrderTotal,
	canCustomerCancelOrder,
	inventoryMovementTypeValues,
	isOpaqueOrderNumber,
	orderStatusValues,
	paymentStatusValues,
	requireTransitionReason,
} from "../domain/order";
import { discountTypes } from "../domain/discount";
import { weightUnits } from "./catalog";

const idSchema = z.string().trim().min(1).max(100);
const timestampSchema = z.number().int().nonnegative();
const versionSchema = z.number().int().positive();
const nonnegativeMinorSchema = z.number().int().nonnegative();
const positiveIntegerSchema = z.number().int().positive();
const postalCodeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z0-9][A-Z0-9 -]{1,11}$/, "Enter a valid postal code");
const mobileSchema = z
	.string()
	.trim()
	.regex(/^\+[1-9]\d{7,14}$/, "Enter an E.164 phone number");
const nullableText = (maximum: number) => z.preprocess(
	(value) => (value === null || (typeof value === "string" && value.trim() === "") ? null : value),
	z.string().trim().max(maximum).nullable(),
);

const deliveryAddressShape = {
	recipientName: z.string().trim().min(1, "Recipient name is required").max(120),
	mobile: mobileSchema,
	addressLine1: z.string().trim().min(1, "Address line 1 is required").max(200),
	addressLine2: nullableText(200),
	landmark: nullableText(200),
	city: z.string().trim().min(1, "City is required").max(120),
	state: z.string().trim().min(1, "State is required").max(120),
	postalCode: postalCodeSchema,
	latitude: z.number().min(-90).max(90).nullable(),
	longitude: z.number().min(-180).max(180).nullable(),
	deliveryInstructions: nullableText(2_000),
};

function validateCoordinates(
	value: { latitude: number | null; longitude: number | null },
	context: z.RefinementCtx,
) {
	if ((value.latitude === null) !== (value.longitude === null)) {
		context.addIssue({
			code: "custom",
			path: ["latitude"],
			message: "Latitude and longitude must be provided together",
		});
	}
}

export const deliveryAddressInputSchema = z
	.object(deliveryAddressShape)
	.strict()
	.superRefine(validateCoordinates);

export const customerAddressInputSchema = z
	.object({
		label: nullableText(80),
		...deliveryAddressShape,
		isDefault: z.boolean().default(false),
	})
	.strict()
	.superRefine(validateCoordinates);

export const customerAddressSchema = z
	.object({
		id: idSchema,
		...customerAddressInputSchema.shape,
		version: versionSchema,
		createdAt: timestampSchema,
		updatedAt: timestampSchema,
	})
	.strict()
	.superRefine(validateCoordinates);

export const updateCustomerAddressInputSchema = customerAddressInputSchema
	.extend({ version: versionSchema })
	.strict();

export const deleteCustomerAddressInputSchema = z
	.object({ version: versionSchema })
	.strict();

export const checkoutExpectedLineSchema = z
	.object({
		offeringId: idSchema,
		quantity: z.number().int().min(1).max(99),
		expectedUnitPriceMinor: nonnegativeMinorSchema,
		offeringVersion: versionSchema,
	})
	.strict();

export const checkoutInputSchema = z
	.object({
		deliveryAddress: deliveryAddressInputSchema,
		expectedLines: z.array(checkoutExpectedLineSchema).min(1).max(25),
		cartUpdatedAt: timestampSchema.nullable(),
		saveAddress: z.boolean().default(false),
	})
	.strict()
	.superRefine((checkout, context) => {
		const offeringIds = new Set<string>();
		for (const [index, line] of checkout.expectedLines.entries()) {
			if (offeringIds.has(line.offeringId)) {
				context.addIssue({
					code: "custom",
					path: ["expectedLines", index, "offeringId"],
					message: "Each offering can be checked out once",
				});
			}
			offeringIds.add(line.offeringId);
		}
	});

export const orderNumberSchema = z
	.string()
	.trim()
	.refine(isOpaqueOrderNumber, "Order number is invalid");
export const orderStatusSchema = z.enum(orderStatusValues);
export const paymentStatusSchema = z.enum(paymentStatusValues);
export const orderCurrencySchema = z.literal("INR");

export const orderAddressSchema = z
	.object({
		orderId: idSchema,
		...deliveryAddressShape,
	})
	.strict()
	.superRefine(validateCoordinates);

const orderItemShape = {
	offeringId: idSchema,
	productId: idSchema,
	productCode: z.string().trim().min(1).max(64),
	productName: z.string().trim().min(1).max(120),
	offeringSku: z.string().trim().min(1).max(64),
	offeringLabel: z.string().trim().min(1).max(120),
	packQuantity: positiveIntegerSchema.nullable(),
	weightValue: positiveIntegerSchema.nullable(),
	weightUnit: z.enum(weightUnits).nullable(),
	listPriceMinor: nonnegativeMinorSchema,
	discountType: z.enum(discountTypes),
	discountValue: nonnegativeMinorSchema,
	effectiveUnitPriceMinor: nonnegativeMinorSchema,
	quantity: z.number().int().min(1).max(99),
	lineTotalMinor: nonnegativeMinorSchema,
};

export const orderItemSchema = z
	.object(orderItemShape)
	.strict()
	.superRefine((item, context) => {
		if ((item.weightValue === null) !== (item.weightUnit === null)) {
			context.addIssue({ code: "custom", path: ["weightValue"], message: "Weight value and unit must be provided together" });
		}
		if (item.packQuantity === null && item.weightValue === null) {
			context.addIssue({ code: "custom", path: ["packQuantity"], message: "Provide a pack quantity or weight snapshot" });
		}
		if (item.lineTotalMinor !== item.effectiveUnitPriceMinor * item.quantity) {
			context.addIssue({ code: "custom", path: ["lineTotalMinor"], message: "Line total must equal unit price times quantity" });
		}
		if (item.discountType === "none" && item.discountValue !== 0) {
			context.addIssue({ code: "custom", path: ["discountValue"], message: "No-discount snapshots must have zero discount value" });
		}
		if (item.discountType === "fixed" && item.discountValue >= item.listPriceMinor) {
			context.addIssue({ code: "custom", path: ["discountValue"], message: "Fixed discounts must be less than list price" });
		}
		if (item.discountType === "percentage" && (item.discountValue < 1 || item.discountValue > 10_000)) {
			context.addIssue({ code: "custom", path: ["discountValue"], message: "Percentage discounts must be between 1 and 10000" });
		}
	});

export const orderStatusHistorySchema = z
	.object({
		id: idSchema,
		fromStatus: orderStatusSchema.nullable(),
		toStatus: orderStatusSchema,
		reason: nullableText(500),
		actorUserId: idSchema.nullable(),
		createdAt: timestampSchema,
	})
	.strict()
	.superRefine((entry, context) => {
		if (entry.fromStatus === entry.toStatus) {
			context.addIssue({ code: "custom", path: ["toStatus"], message: "Status history must change status" });
		}
	});

const orderShape = {
	id: idSchema,
	orderNumber: orderNumberSchema,
	status: orderStatusSchema,
	paymentStatus: paymentStatusSchema,
	currency: orderCurrencySchema,
	subtotalMinor: nonnegativeMinorSchema,
	deliveryFeeMinor: nonnegativeMinorSchema,
	totalMinor: nonnegativeMinorSchema,
	itemCount: nonnegativeMinorSchema,
	placedAt: timestampSchema,
	expectedDeliveryAt: timestampSchema.nullable(),
	cancelledAt: timestampSchema.nullable(),
	customerCanCancel: z.boolean(),
	version: versionSchema,
};

export const orderSchema = z
	.object(orderShape)
	.strict()
	.superRefine((order, context) => {
		if (order.totalMinor !== calculateOrderTotal(order.subtotalMinor, order.deliveryFeeMinor)) {
			context.addIssue({ code: "custom", path: ["totalMinor"], message: "Order total must equal subtotal plus delivery fee" });
		}
		if (order.customerCanCancel !== canCustomerCancelOrder(order.status)) {
			context.addIssue({ code: "custom", path: ["customerCanCancel"], message: "Cancellation eligibility must match order status" });
		}
		if (order.cancelledAt !== null && order.status !== "cancelled") {
			context.addIssue({ code: "custom", path: ["cancelledAt"], message: "Only cancelled orders can have a cancellation time" });
		}
		if (order.status === "cancelled" && order.cancelledAt === null) {
			context.addIssue({ code: "custom", path: ["cancelledAt"], message: "Cancelled orders require a cancellation time" });
		}
	});

export const orderDetailSchema = orderSchema.extend({
	address: orderAddressSchema,
	items: z.array(orderItemSchema).min(1),
	statusHistory: z.array(orderStatusHistorySchema).min(1),
}).superRefine((order, context) => {
	const subtotal = order.items.reduce((total, item) => total + item.lineTotalMinor, 0);
	if (order.subtotalMinor !== subtotal) {
		context.addIssue({ code: "custom", path: ["subtotalMinor"], message: "Order subtotal must equal the item total" });
	}
	if (order.itemCount !== order.items.reduce((total, item) => total + item.quantity, 0)) {
		context.addIssue({ code: "custom", path: ["itemCount"], message: "Item count must equal ordered quantities" });
	}
});

export const orderListQuerySchema = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		pageSize: z.coerce.number().int().min(1).max(50).default(20),
	})
	.strict();

export const orderListResponseSchema = z
	.object({
		items: z.array(orderSchema),
		page: z.number().int().min(1),
		pageSize: z.number().int().min(1).max(50),
		totalItems: nonnegativeMinorSchema,
		totalPages: nonnegativeMinorSchema,
	})
	.strict()
	.superRefine((response, context) => {
		if (response.totalPages !== Math.ceil(response.totalItems / response.pageSize)) {
			context.addIssue({ code: "custom", path: ["totalPages"], message: "Total pages must match item count and page size" });
		}
	});

export const cancelOrderInputSchema = z
	.object({ reason: z.string().trim().min(1, "A cancellation reason is required").max(500) })
	.strict();

export const reorderLineStatusValues = [
	"added",
	"unavailable",
	"out_of_stock",
	"insufficient_stock",
	"quantity_limit",
] as const;

export const reorderLineResultSchema = z
	.object({
		offeringId: idSchema,
		requestedQuantity: z.number().int().min(1).max(99),
		addedQuantity: nonnegativeMinorSchema,
		status: z.enum(reorderLineStatusValues),
	})
	.strict()
	.superRefine((line, context) => {
		if (line.status === "added" && (line.addedQuantity < 1 || line.addedQuantity > line.requestedQuantity)) {
			context.addIssue({ code: "custom", path: ["addedQuantity"], message: "Added reorder quantity must be within the requested amount" });
		}
		if (line.status !== "added" && line.addedQuantity !== 0) {
			context.addIssue({ code: "custom", path: ["addedQuantity"], message: "Unavailable reorder lines cannot add quantity" });
		}
	});

export const reorderResultSchema = z
	.object({
		cartItemCount: nonnegativeMinorSchema,
		lines: z.array(reorderLineResultSchema).min(1),
	})
	.strict()
	.superRefine((result, context) => {
		const ids = new Set<string>();
		for (const [index, line] of result.lines.entries()) {
			if (ids.has(line.offeringId)) {
				context.addIssue({ code: "custom", path: ["lines", index, "offeringId"], message: "Each offering can be reordered once" });
			}
			ids.add(line.offeringId);
		}
	});

export const cancelOrderResponseSchema = orderDetailSchema;

export const orderTransitionInputSchema = z
	.object({
		toStatus: z.enum(orderStatusValues),
		reason: z.string().trim().min(1).max(500).optional(),
		expectedDeliveryAt: timestampSchema.nullable().optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (requireTransitionReason(value.toStatus) && !value.reason) {
			ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required for this transition" });
		}
		if (value.toStatus === "confirmed" && !value.expectedDeliveryAt) {
			ctx.addIssue({ code: "custom", path: ["expectedDeliveryAt"], message: "An expected delivery time is required to acknowledge" });
		}
	});

export const verifyDeliveryInputSchema = z
	.object({
		token: z.string().trim().min(16).max(256).optional(),
		pin: z.string().regex(/^\d{6}$/).optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (Boolean(value.token) === Boolean(value.pin)) {
			ctx.addIssue({ code: "custom", path: ["token"], message: "Provide exactly one of token or pin" });
		}
	});

export const deliveryProofResponseSchema = z.object({
	orderId: idSchema,
	qrToken: z.string().min(16).max(256),
	pin: z.string().regex(/^\d{6}$/),
	expiresAt: timestampSchema,
});

// IMPORTANT: do NOT mutate the existing orderDetailSchema. Add a SEPARATE
// customer-facing detail schema so existing Phase 4 code/tests keep passing:
export const customerOrderDetailSchema = orderDetailSchema.extend({
	deliveryProof: deliveryProofResponseSchema.nullable().optional(),
});

export const inventoryMovementTypeSchema = z.enum(inventoryMovementTypeValues);

export function orderIsCustomerCancellable(status: z.infer<typeof orderStatusSchema>) {
	return canCustomerCancelOrder(status);
}

export type DeliveryAddressInput = z.infer<typeof deliveryAddressInputSchema>;
export type CustomerAddressInput = z.infer<typeof customerAddressInputSchema>;
export type CustomerAddress = z.infer<typeof customerAddressSchema>;
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressInputSchema>;
export type DeleteCustomerAddressInput = z.infer<typeof deleteCustomerAddressInputSchema>;
export type CheckoutExpectedLine = z.infer<typeof checkoutExpectedLineSchema>;
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrderDetail = z.infer<typeof orderDetailSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type OrderStatusHistory = z.infer<typeof orderStatusHistorySchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;
export type CancelOrderResponse = z.infer<typeof cancelOrderResponseSchema>;
export type ReorderLineResult = z.infer<typeof reorderLineResultSchema>;
export type ReorderResult = z.infer<typeof reorderResultSchema>;
export type OrderTransitionInput = z.infer<typeof orderTransitionInputSchema>;
export type VerifyDeliveryInput = z.infer<typeof verifyDeliveryInputSchema>;
export type DeliveryProofResponse = z.infer<typeof deliveryProofResponseSchema>;
export type CustomerOrderDetail = z.infer<typeof customerOrderDetailSchema>;
