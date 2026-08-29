import { describe, expect, it } from "vitest";
import {
	catalogListResponseSchema,
	categoryCreateInputSchema,
	cmsProductListQuerySchema,
	inventoryMovementSchema,
	offeringCreateInputSchema,
	productCreateInputSchema,
	productImageSchema,
} from "./catalog";

const validProductInput = {
	code: " produce_01 ",
	slug: " Fresh Produce ",
	name: "Fresh produce",
	description: "Seasonal fruit and vegetables",
	baseWeightValue: null,
	baseWeightUnit: null,
	categoryId: " category-1 ",
	tagIds: ["tag-b", "tag-a", "tag-b"],
	active: false,
};

const validOfferingInput = {
	productId: "product-1",
	sku: " produce_01-kg ",
	label: "1 kg pack",
	packQuantity: null,
	weightValue: 1,
	weightUnit: "kg" as const,
	listPriceMinor: 1_000,
	discountType: "none" as const,
	discountValue: 0,
	lowStockThreshold: 0,
	active: true,
};

describe("catalog inputs", () => {
	it("normalizes product code and slug and deduplicates sorted tag IDs", () => {
		const product = productCreateInputSchema.parse(validProductInput);

		expect(product.code).toBe("PRODUCE_01");
		expect(product.slug).toBe("fresh-produce");
		expect(product.categoryId).toBe("category-1");
		expect(product.tagIds).toEqual(["tag-a", "tag-b"]);
	});

	it("requires an offering to have a pack quantity or complete weight pair", () => {
		expect(
			offeringCreateInputSchema.safeParse({
				...validOfferingInput,
				weightValue: null,
				weightUnit: null,
			}),
		).toMatchObject({ success: false });
		expect(
			offeringCreateInputSchema.safeParse({
				...validOfferingInput,
				weightUnit: null,
			}),
		).toMatchObject({ success: false });
		expect(offeringCreateInputSchema.parse(validOfferingInput).sku).toBe(
			"PRODUCE_01-KG",
		);
	});

	it("rejects list page sizes above 100 and applies pagination defaults", () => {
		expect(cmsProductListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(
			false,
		);
		expect(cmsProductListQuerySchema.parse({})).toMatchObject({
			page: 1,
			pageSize: 20,
		});
	});

	it("rejects unknown properties from strict schemas", () => {
		expect(
			categoryCreateInputSchema.safeParse({
				name: "Produce",
				slug: "produce",
				description: null,
				active: true,
				unexpected: true,
			}).success,
		).toBe(false);
		expect(
			catalogListResponseSchema(categoryCreateInputSchema).safeParse({
				items: [],
				page: 1,
				pageSize: 20,
				totalItems: 0,
				totalPages: 0,
				unexpected: true,
			}).success,
		).toBe(false);
	});

	it("validates product weight fields as a pair", () => {
		expect(
			productCreateInputSchema.safeParse({
				...validProductInput,
				baseWeightValue: 500,
			}).success,
		).toBe(false);
		expect(
			productCreateInputSchema.safeParse({
				...validProductInput,
				baseWeightUnit: "g",
			}).success,
		).toBe(false);
	});

	it("validates discounts against their type and list price", () => {
		expect(
			offeringCreateInputSchema.safeParse({
				...validOfferingInput,
				discountValue: 1,
			}).success,
		).toBe(false);
		expect(
			offeringCreateInputSchema.safeParse({
				...validOfferingInput,
				discountType: "fixed",
				discountValue: 1_000,
			}).success,
		).toBe(false);
		expect(
			offeringCreateInputSchema.safeParse({
				...validOfferingInput,
				discountType: "percentage",
				discountValue: 0,
			}).success,
		).toBe(false);
		expect(
			offeringCreateInputSchema.safeParse({
				...validOfferingInput,
				discountType: "percentage",
				discountValue: 10_001,
			}).success,
		).toBe(false);
	});
});

describe("catalog response invariants", () => {
	it("preserves the product association on image responses", () => {
		expect(
			productImageSchema.parse({
				id: "image-1",
				productId: " product-1 ",
				url: "/api/catalog/images/image-1",
				mimeType: "image/webp",
				byteSize: 123,
				altText: "A produce box",
				displayOrder: 0,
				createdAt: 1,
			}).productId,
		).toBe("product-1");
	});

	it("limits image display order to the five gallery positions", () => {
		expect(
			productImageSchema.safeParse({
				id: "image-1",
				productId: "product-1",
				url: "/api/catalog/images/image-1",
				mimeType: "image/webp",
				byteSize: 123,
				altText: "A produce box",
				displayOrder: 5,
				createdAt: 1,
			}).success,
		).toBe(false);
	});

	it("requires inventory movement quantities to balance", () => {
		const movement = {
			id: "movement-1",
			offeringId: "offering-1",
			previousQuantity: 10,
			quantityDelta: -2,
			resultingQuantity: 9,
			reason: "Damaged item",
			movementType: "manual_adjustment" as const,
			actorUserId: "user-1",
			offeringVersion: 2,
			createdAt: 1,
		};

		expect(inventoryMovementSchema.safeParse(movement).success).toBe(false);
		expect(
			inventoryMovementSchema.safeParse({
				...movement,
				resultingQuantity: 8,
			}).success,
		).toBe(true);
	});
});
