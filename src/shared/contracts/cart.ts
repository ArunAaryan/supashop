import { z } from "zod";

const idSchema = z.string().trim().min(1).max(100);
const timestampSchema = z.number().int().nonnegative();
const minorUnitSchema = z.number().int().nonnegative();
const versionSchema = z.number().int().positive();

export const cartQuantitySchema = z.number().int().min(1).max(99);

export const addCartItemInputSchema = z
	.object({
		offeringId: idSchema,
		quantity: cartQuantitySchema,
	})
	.strict();

export const setCartItemInputSchema = z
	.object({ quantity: cartQuantitySchema })
	.strict();

export const cartAvailabilityValues = [
	"available",
	"out_of_stock",
	"insufficient_stock",
	"unavailable",
] as const;

export const cartAvailabilitySchema = z.enum(cartAvailabilityValues);

export const cartLineSchema = z
	.object({
		offeringId: idSchema,
		productId: idSchema,
		productSlug: z.string().trim().min(1).max(200),
		productName: z.string().trim().min(1).max(120),
		offeringLabel: z.string().trim().min(1).max(120),
		imageUrl: z.string().trim().min(1).max(2_000).nullable(),
		quantity: cartQuantitySchema,
		lineVersion: versionSchema,
		unitPriceMinorAtAdd: minorUnitSchema,
		currentUnitPriceMinor: minorUnitSchema,
		lineTotalMinor: minorUnitSchema,
		priceChanged: z.boolean(),
		availableStock: minorUnitSchema,
		availability: cartAvailabilitySchema,
	})
	.strict()
	.superRefine((line, context) => {
		if (line.lineTotalMinor !== line.currentUnitPriceMinor * line.quantity) {
			context.addIssue({
				code: "custom",
				path: ["lineTotalMinor"],
				message: "Line total must use the current unit price and quantity",
			});
		}
		if (line.priceChanged !== (line.unitPriceMinorAtAdd !== line.currentUnitPriceMinor)) {
			context.addIssue({
				code: "custom",
				path: ["priceChanged"],
				message: "Price-change status must match the captured and current prices",
			});
		}
		if (line.availability === "available" && line.availableStock < line.quantity) {
			context.addIssue({
				code: "custom",
				path: ["availability"],
				message: "Available lines must have enough current stock",
			});
		}
		if (line.availability === "out_of_stock" && line.availableStock !== 0) {
			context.addIssue({
				code: "custom",
				path: ["availability"],
				message: "Out-of-stock lines must have no current stock",
			});
		}
		if (
			line.availability === "insufficient_stock" &&
			(line.availableStock === 0 || line.availableStock >= line.quantity)
		) {
			context.addIssue({
				code: "custom",
				path: ["availability"],
				message: "Insufficient-stock lines must have some, but not enough, current stock",
			});
		}
	});

export const cartResponseSchema = z
	.object({
		lines: z.array(cartLineSchema),
		itemCount: minorUnitSchema,
		subtotalMinor: minorUnitSchema,
		requiresReview: z.boolean(),
		updatedAt: timestampSchema.nullable(),
	})
	.strict()
	.superRefine((cart, context) => {
		const itemCount = cart.lines.reduce((total, line) => total + line.quantity, 0);
		if (cart.itemCount !== itemCount) {
			context.addIssue({
				code: "custom",
				path: ["itemCount"],
				message: "Item count must equal the sum of line quantities",
			});
		}
		const subtotal = cart.lines.reduce((total, line) => total + line.lineTotalMinor, 0);
		if (cart.subtotalMinor !== subtotal) {
			context.addIssue({
				code: "custom",
				path: ["subtotalMinor"],
				message: "Subtotal must equal the sum of current line totals",
			});
		}
		const requiresReview = cart.lines.some(
			(line) => line.priceChanged || line.availability !== "available",
		);
		if (cart.requiresReview !== requiresReview) {
			context.addIssue({
				code: "custom",
				path: ["requiresReview"],
				message: "Review status must reflect price and availability changes",
			});
		}
	});

export type AddCartItemInput = z.infer<typeof addCartItemInputSchema>;
export type SetCartItemInput = z.infer<typeof setCartItemInputSchema>;
export type CartLine = z.infer<typeof cartLineSchema>;
export type CartResponse = z.infer<typeof cartResponseSchema>;
