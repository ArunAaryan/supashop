import { describe, expect, it } from "vitest";
import {
	catalogListResponseSchema,
	catalogListQuerySchema,
	categoryCreateInputSchema,
	cmsCategoryListQuerySchema,
	cmsInventoryMovementListQuerySchema,
	cmsProductListQuerySchema,
	imageReorderInputSchema,
	imageUploadMetadataSchema,
	inventoryAdjustmentInputSchema,
	inventoryMovementSchema,
	offeringCreateInputSchema,
	offeringInputSchema,
	offeringSchema,
	offeringUpdateInputSchema,
	productCreateInputSchema,
	productInputSchema,
	productDetailSchema,
	productImageSchema,
	productSummarySchema,
	productUpdateInputSchema,
	publicProductListQuerySchema,
	publicSearchQuerySchema,
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

const validOfferingUpdateInput = {
	sku: validOfferingInput.sku,
	label: validOfferingInput.label,
	packQuantity: validOfferingInput.packQuantity,
	weightValue: validOfferingInput.weightValue,
	weightUnit: validOfferingInput.weightUnit,
	listPriceMinor: validOfferingInput.listPriceMinor,
	discountType: validOfferingInput.discountType,
	discountValue: validOfferingInput.discountValue,
	lowStockThreshold: validOfferingInput.lowStockThreshold,
	active: validOfferingInput.active,
	version: 1,
};

const validOfferingResponse = {
	id: "offering-1",
	productId: "product-1",
	sku: "PRODUCE_01-KG",
	label: "1 kg pack",
	packQuantity: null,
	weightValue: 1,
	weightUnit: "kg" as const,
	listPriceMinor: 1_000,
	discountType: "none" as const,
	discountValue: 0,
	discountMinor: 0,
	effectivePriceMinor: 1_000,
	stockQuantity: 0,
	lowStockThreshold: 0,
	inStock: false,
	lowStock: true,
	active: true,
	version: 1,
	createdAt: 1,
	updatedAt: 1,
};

const validCategoryResponse = {
	id: "category-1",
	name: "Produce",
	slug: "produce",
	description: null,
	active: true,
	productCount: 1,
	createdAt: 1,
	updatedAt: 1,
};

function productImage(
	id: string,
	displayOrder: number,
	productId = "product-1",
) {
	return {
		id,
		productId,
		url: `/api/catalog/images/${id}`,
		mimeType: "image/webp" as const,
		byteSize: 123,
		altText: `Image ${id}`,
		displayOrder,
		createdAt: 1,
	};
}

const primaryImage = productImage("image-1", 0);

const validProductSummary = {
	id: "product-1",
	code: "PRODUCE_01",
	slug: "produce-box",
	name: "Produce box",
	description: "Seasonal produce",
	baseWeightValue: null,
	baseWeightUnit: null,
	categoryId: "category-1",
	category: validCategoryResponse,
	active: true,
	version: 1,
	createdAt: 1,
	updatedAt: 1,
	primaryImage,
	activeOfferingCount: 1,
	minimumEffectivePriceMinor: 1_000,
	hasPromotion: false,
	inStock: false,
};

const validProductDetail = {
	...validProductSummary,
	tags: [],
	images: [primaryImage],
	offerings: [validOfferingResponse],
};

describe("catalog inputs", () => {
	it("retains complete compatibility payload contracts", () => {
		expect(
			productInputSchema.parse({ ...validProductInput, version: 1 }),
		).toMatchObject({ code: "PRODUCE_01", slug: "fresh-produce", version: 1 });
		expect(
			offeringInputSchema.parse({ ...validOfferingInput, version: 1 }),
		).toMatchObject({ sku: "PRODUCE_01-KG", productId: "product-1", version: 1 });
		expect(
			catalogListQuerySchema.safeParse({ page: "1", pageSize: "101" }).success,
		).toBe(false);
	});

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

describe("catalog mutation contract coverage", () => {
	it.each([
		{
			label: "product",
			schema: productUpdateInputSchema,
			input: { ...validProductInput, version: 1 },
		},
		{
			label: "offering",
			schema: offeringUpdateInputSchema,
			input: validOfferingUpdateInput,
		},
	])("requires a positive version for $label updates", ({ schema, input }) => {
		expect(schema.safeParse(input).success).toBe(true);
		expect(schema.safeParse({ ...input, version: 0 }).success).toBe(false);
		expect(schema.safeParse({ ...input, version: undefined }).success).toBe(false);
	});

	it.each([
		{
			label: "image upload metadata",
			schema: imageUploadMetadataSchema,
			valid: { altText: "Produce box" },
			invalid: { altText: "" },
		},
		{
			label: "image reorder",
			schema: imageReorderInputSchema,
			valid: { imageIds: ["image-1", "image-2"] },
			invalid: { imageIds: ["image-1", "image-1"] },
		},
	])("accepts valid and rejects invalid $label", ({ schema, valid, invalid }) => {
		expect(schema.safeParse(valid).success).toBe(true);
		expect(schema.safeParse(invalid).success).toBe(false);
	});

	it.each([
		{ stockQuantity: -1, reason: "Counted stock", version: 1 },
		{ stockQuantity: 0, reason: "", version: 1 },
		{ stockQuantity: 0, reason: "Counted stock", version: 0 },
	])("rejects invalid inventory adjustment %#", (adjustment) => {
		expect(inventoryAdjustmentInputSchema.safeParse(adjustment).success).toBe(
			false,
		);
	});

	it("accepts a valid inventory adjustment at zero stock", () => {
		expect(
			inventoryAdjustmentInputSchema.parse({
				stockQuantity: 0,
				reason: " Cycle count ",
				version: 1,
			}),
		).toEqual({ stockQuantity: 0, reason: "Cycle count", version: 1 });
	});
});

describe("catalog query contract coverage", () => {
	it.each([
		{
			label: "CMS category",
			schema: cmsCategoryListQuerySchema,
			input: {
				page: "2",
				pageSize: "100",
				active: "false",
				sortBy: "name",
				sortDirection: "asc",
			},
			expected: { page: 2, pageSize: 100, active: false },
		},
		{
			label: "public product",
			schema: publicProductListQuerySchema,
			input: {
				page: "3",
				categorySlug: " Fresh Produce ",
				inStock: "true",
				minPriceMinor: "100",
				maxPriceMinor: "200",
			},
			expected: {
				page: 3,
				pageSize: 20,
				categorySlug: "fresh-produce",
				inStock: true,
				minPriceMinor: 100,
				maxPriceMinor: 200,
			},
		},
		{
			label: "public search",
			schema: publicSearchQuerySchema,
			input: { search: " apples " },
			expected: { page: 1, pageSize: 20, search: "apples", sortBy: "relevance" },
		},
	])("coerces and normalizes a representative $label query", ({ schema, input, expected }) => {
		expect(schema.parse(input)).toMatchObject(expected);
	});

	it.each([
		{
			label: "public product price",
			schema: publicProductListQuerySchema,
			valid: { minPriceMinor: 100, maxPriceMinor: 100 },
			invalid: { minPriceMinor: 101, maxPriceMinor: 100 },
		},
		{
			label: "public search price",
			schema: publicSearchQuerySchema,
			valid: { search: "apples", minPriceMinor: 100, maxPriceMinor: 100 },
			invalid: { search: "apples", minPriceMinor: 101, maxPriceMinor: 100 },
		},
		{
			label: "inventory movement date",
			schema: cmsInventoryMovementListQuerySchema,
			valid: { createdFrom: 100, createdTo: 100 },
			invalid: { createdFrom: 101, createdTo: 100 },
		},
	])("validates the $label range", ({ schema, valid, invalid }) => {
		expect(schema.safeParse(valid).success).toBe(true);
		expect(schema.safeParse(invalid).success).toBe(false);
	});
});

describe("catalog response invariants", () => {
	it.each([
		{ stockQuantity: 0, lowStockThreshold: 0, inStock: false, lowStock: true },
		{ stockQuantity: 5, lowStockThreshold: 5, inStock: true, lowStock: true },
		{ stockQuantity: 6, lowStockThreshold: 5, inStock: true, lowStock: false },
	])(
		"derives availability at stock $stockQuantity and threshold $lowStockThreshold",
		(availability) => {
			const response = { ...validOfferingResponse, ...availability };

			expect(offeringSchema.safeParse(response).success).toBe(true);
			expect(
				offeringSchema.safeParse({
					...response,
					inStock: !response.inStock,
				}).success,
			).toBe(false);
			expect(
				offeringSchema.safeParse({
					...response,
					lowStock: !response.lowStock,
				}).success,
			).toBe(false);
		},
	);

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

	it("requires nested category IDs to match the product category ID", () => {
		const mismatchedCategory = {
			...validProductSummary,
			category: { ...validCategoryResponse, id: "category-2" },
		};

		expect(productSummarySchema.safeParse(mismatchedCategory).success).toBe(false);
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				category: mismatchedCategory.category,
			}).success,
		).toBe(false);
	});

	it("requires a summary primary image to belong to the product at order zero", () => {
		expect(
			productSummarySchema.safeParse({
				...validProductSummary,
				primaryImage: productImage("image-1", 0, "product-2"),
			}).success,
		).toBe(false);
		expect(
			productSummarySchema.safeParse({
				...validProductSummary,
				primaryImage: productImage("image-1", 1),
			}).success,
		).toBe(false);
	});

	it("requires every detail image and offering to belong to the product", () => {
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				images: [productImage("image-1", 0, "product-2")],
			}).success,
		).toBe(false);
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				offerings: [{ ...validOfferingResponse, productId: "product-2" }],
			}).success,
		).toBe(false);
	});

	it("requires unique image IDs and display orders within a gallery", () => {
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				images: [primaryImage, productImage("image-1", 1)],
			}).success,
		).toBe(false);
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				images: [primaryImage, productImage("image-2", 0)],
			}).success,
		).toBe(false);
	});

	it("requires the primary image to exactly match the order-zero gallery image", () => {
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				primaryImage: null,
			}).success,
		).toBe(false);
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				images: [],
			}).success,
		).toBe(false);
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				primaryImage: productImage("image-2", 0),
			}).success,
		).toBe(false);
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				primaryImage: { ...primaryImage, altText: "Contradictory alt text" },
			}).success,
		).toBe(false);
		expect(productDetailSchema.safeParse(validProductDetail).success).toBe(true);
		expect(
			productDetailSchema.safeParse({
				...validProductDetail,
				primaryImage: null,
				images: [],
				offerings: [],
			}).success,
		).toBe(true);
	});
});
