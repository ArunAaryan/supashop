import { describe, expect, it } from "vitest";

import {
	addCartItemInputSchema,
	cartQuantitySchema,
	cartResponseSchema,
	setCartItemInputSchema,
} from "./cart";

const category = {
	id: "category-1",
	name: "Dairy",
	slug: "dairy",
	description: null,
	active: true,
	productCount: 1,
	createdAt: 1,
	updatedAt: 1,
};

const image = {
	id: "image-1",
	productId: "product-1",
	url: "/api/catalog/images/image-1",
	mimeType: "image/webp" as const,
	byteSize: 100,
	altText: "Milk bottle",
	displayOrder: 0,
	createdAt: 1,
};

const offering = {
	id: "offering-1",
	productId: "product-1",
	sku: "MILK-1L",
	label: "1 litre bottle",
	packQuantity: 1,
	weightValue: null,
	weightUnit: null,
	listPriceMinor: 1_000,
	discountType: "percentage" as const,
	discountValue: 1_000,
	discountMinor: 100,
	effectivePriceMinor: 900,
	stockQuantity: 3,
	lowStockThreshold: 1,
	inStock: true,
	lowStock: false,
	active: true,
	version: 2,
	createdAt: 1,
	updatedAt: 2,
};

const product = {
	id: "product-1",
	code: "MILK",
	slug: "whole-milk",
	name: "Whole milk",
	description: "Fresh dairy milk",
	baseWeightValue: null,
	baseWeightUnit: null,
	categoryId: category.id,
	category,
	active: true,
	version: 1,
	createdAt: 1,
	updatedAt: 1,
	primaryImage: image,
	activeOfferingCount: 1,
	minimumEffectivePriceMinor: 900,
	hasPromotion: true,
	inStock: true,
};

const validCart = {
	itemCount: 2,
	subtotalMinor: 1_800,
	requiresReview: true,
	updatedAt: 2,
	lines: [
		{
			offeringId: offering.id,
			productId: product.id,
			productSlug: product.slug,
			productName: product.name,
			offeringLabel: offering.label,
			imageUrl: image.url,
			quantity: 2,
			lineVersion: 2,
			unitPriceMinorAtAdd: 1_000,
			currentUnitPriceMinor: 900,
			lineTotalMinor: 1_800,
			availability: "available" as const,
			priceChanged: true,
			availableStock: 3,
		},
	],
};

describe("cart contracts", () => {
	it("accepts an authoritative cart projection with price-at-add comparison and totals", () => {
		expect(cartResponseSchema.parse(validCart)).toEqual(validCart);
	});

	it("accepts fully discounted cart lines with zero current and captured prices", () => {
		const freeCart = {
			...validCart,
			subtotalMinor: 0,
			requiresReview: false,
			lines: [{
				...validCart.lines[0],
				unitPriceMinorAtAdd: 0,
				currentUnitPriceMinor: 0,
				lineTotalMinor: 0,
				priceChanged: false,
			}],
		};
		expect(cartResponseSchema.parse(freeCart)).toEqual(freeCart);
	});

	it("accepts only quantities one through ninety-nine", () => {
		expect(cartQuantitySchema.parse(1)).toBe(1);
		expect(addCartItemInputSchema.parse({ offeringId: "offering-1", quantity: 1 })).toEqual({ offeringId: "offering-1", quantity: 1 });
		expect(setCartItemInputSchema.parse({ quantity: 99 })).toEqual({ quantity: 99 });
		expect(addCartItemInputSchema.safeParse({ offeringId: "offering-1", quantity: 0 }).success).toBe(false);
		expect(setCartItemInputSchema.safeParse({ quantity: 100 }).success).toBe(false);
	});

	it("rejects response totals, price comparisons, and unknown fields that do not match current items", () => {
		expect(cartResponseSchema.safeParse({ ...validCart, itemCount: 1 }).success).toBe(false);
		expect(cartResponseSchema.safeParse({
		...validCart,
		lines: [{ ...validCart.lines[0], priceChanged: false }],
	}).success).toBe(false);
		expect(cartResponseSchema.safeParse({ ...validCart, subtotalMinor: 1_700 }).success).toBe(false);
		expect(addCartItemInputSchema.safeParse({ offeringId: "offering-1", quantity: 1, unexpected: true }).success).toBe(false);
	});
});
