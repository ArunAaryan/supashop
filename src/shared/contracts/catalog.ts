import { z } from "zod";
import {
	calculateEffectivePrice,
	discountTypes,
	type DiscountType,
} from "../domain/discount";
import { inventoryMovementTypeValues } from "../domain/order";

export const weightUnits = ["g", "kg", "ml", "l"] as const;
export type WeightUnit = (typeof weightUnits)[number];

export const inventoryMovementTypes = inventoryMovementTypeValues;
export type InventoryMovementType = (typeof inventoryMovementTypes)[number];

const idSchema = z.string().trim().min(1).max(100);
const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(2_000);
const nullableDescriptionSchema = z.preprocess(
	(value) => (value === null || (typeof value === "string" && value.trim() === "") ? null : value),
	z.string().trim().max(2_000).nullable(),
);
const timestampSchema = z.number().int().nonnegative();
const versionSchema = z.number().int().positive();
const nonnegativeIntegerSchema = z.number().int().nonnegative();
const positiveIntegerSchema = z.number().int().positive();
const weightUnitSchema = z.enum(weightUnits);
const nullableWeightUnitSchema = weightUnitSchema.nullable();
const nullableWeightValueSchema = positiveIntegerSchema.nullable();
const discountTypeSchema = z.enum(discountTypes);

function normalizeSlug(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

const slugSchema = z
	.string()
	.trim()
	.min(1)
	.transform(normalizeSlug)
	.pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));

const codeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/);

const tagIdsSchema = z
	.array(idSchema)
	.transform((tagIds) => [...new Set(tagIds)].sort());

const queryBooleanSchema = z.preprocess((value) => {
	if (value === "true") return true;
	if (value === "false") return false;
	return value;
}, z.boolean());

const optionalSearchSchema = z.preprocess(
	(value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
	z.string().trim().max(100).optional(),
);

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);
const sortDirectionSchema = z.enum(["asc", "desc"]);

type WeightPair = {
	weightValue: number | null;
	weightUnit: WeightUnit | null;
};

type BaseWeightPair = {
	baseWeightValue: number | null;
	baseWeightUnit: WeightUnit | null;
};

type OfferingRules = WeightPair & {
	packQuantity: number | null;
	listPriceMinor: number;
	discountType: DiscountType;
	discountValue: number;
};

type OfferingAvailability = {
	stockQuantity: number;
	lowStockThreshold: number;
	inStock: boolean;
	lowStock: boolean;
};

function validateWeightPair(value: WeightPair, context: z.RefinementCtx): void {
	if ((value.weightValue === null) !== (value.weightUnit === null)) {
		context.addIssue({
			code: "custom",
			path: ["weightValue"],
			message: "Weight value and unit must be provided together",
		});
	}
}

function validateBaseWeightPair(
	value: BaseWeightPair,
	context: z.RefinementCtx,
): void {
	if ((value.baseWeightValue === null) !== (value.baseWeightUnit === null)) {
		context.addIssue({
			code: "custom",
			path: ["baseWeightValue"],
			message: "Base weight value and unit must be provided together",
		});
	}
}

function validateOfferingRules(
	offering: OfferingRules,
	context: z.RefinementCtx,
): void {
	validateWeightPair(offering, context);

	const hasWeight = offering.weightValue !== null && offering.weightUnit !== null;
	if (offering.packQuantity === null && !hasWeight) {
		context.addIssue({
			code: "custom",
			path: ["packQuantity"],
			message: "Provide a pack quantity or weight",
		});
	}

	try {
		calculateEffectivePrice(
			offering.listPriceMinor,
			offering.discountType,
			offering.discountValue,
		);
	} catch (error) {
		context.addIssue({
			code: "custom",
			path: ["discountValue"],
			message: error instanceof Error ? error.message : "Invalid discount",
		});
	}
}

function validateOfferingAvailability(
	offering: OfferingAvailability,
	context: z.RefinementCtx,
): void {
	if (offering.inStock !== (offering.stockQuantity > 0)) {
		context.addIssue({
			code: "custom",
			path: ["inStock"],
			message: "In-stock status must match stock quantity",
		});
	}
	if (offering.lowStock !== (offering.stockQuantity <= offering.lowStockThreshold)) {
		context.addIssue({
			code: "custom",
			path: ["lowStock"],
			message: "Low-stock status must match stock quantity and threshold",
		});
	}
}

const categoryShape = {
	id: idSchema,
	name: nameSchema,
	slug: slugSchema,
	description: nullableDescriptionSchema,
	active: z.boolean(),
	productCount: nonnegativeIntegerSchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
};

export const categorySchema = z.object(categoryShape).strict();

const tagShape = {
	id: idSchema,
	name: nameSchema,
	slug: slugSchema,
	active: z.boolean(),
	productCount: nonnegativeIntegerSchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
};

export const tagSchema = z.object(tagShape).strict();

const productImageShape = {
	id: idSchema,
	productId: idSchema,
	url: z.string().trim().min(1).max(2_000),
	mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
	byteSize: positiveIntegerSchema.max(5 * 1_024 * 1_024),
	altText: z.string().trim().min(1).max(200),
	displayOrder: z.number().int().min(0).max(4),
	createdAt: timestampSchema,
};

export const productImageSchema = z.object(productImageShape).strict();

const offeringRulesShape = {
	packQuantity: positiveIntegerSchema.nullable(),
	weightValue: nullableWeightValueSchema,
	weightUnit: nullableWeightUnitSchema,
	listPriceMinor: positiveIntegerSchema,
	discountType: discountTypeSchema,
	discountValue: nonnegativeIntegerSchema,
};

const offeringShape = {
	id: idSchema,
	productId: idSchema,
	sku: codeSchema,
	label: z.string().trim().min(1).max(120),
	...offeringRulesShape,
	discountMinor: nonnegativeIntegerSchema,
	effectivePriceMinor: nonnegativeIntegerSchema,
	stockQuantity: nonnegativeIntegerSchema,
	lowStockThreshold: nonnegativeIntegerSchema,
	inStock: z.boolean(),
	lowStock: z.boolean(),
	active: z.boolean(),
	version: versionSchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
};

export const offeringSchema = z
	.object(offeringShape)
	.strict()
	.superRefine((offering, context) => {
		validateOfferingRules(offering, context);
		validateOfferingAvailability(offering, context);
		try {
			const price = calculateEffectivePrice(
				offering.listPriceMinor,
				offering.discountType,
				offering.discountValue,
			);
			if (offering.discountMinor !== price.discountMinor) {
				context.addIssue({
					code: "custom",
					path: ["discountMinor"],
					message: "Discount amount does not match the discount rules",
				});
			}
			if (offering.effectivePriceMinor !== price.effectivePriceMinor) {
				context.addIssue({
					code: "custom",
					path: ["effectivePriceMinor"],
					message: "Effective price does not match the discount rules",
				});
			}
		} catch {
			// validateOfferingRules reports the canonical discount issue.
		}
	});

const productBaseShape = {
	id: idSchema,
	code: codeSchema,
	slug: slugSchema,
	name: nameSchema,
	description: descriptionSchema,
	baseWeightValue: nullableWeightValueSchema,
	baseWeightUnit: nullableWeightUnitSchema,
	categoryId: idSchema,
	category: categorySchema,
	active: z.boolean(),
	version: versionSchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
};

const productSummaryShape = {
	...productBaseShape,
	primaryImage: productImageSchema.nullable(),
	activeOfferingCount: nonnegativeIntegerSchema,
	minimumEffectivePriceMinor: nonnegativeIntegerSchema.nullable(),
	hasPromotion: z.boolean(),
	inStock: z.boolean(),
};

type ProductImageResponse = z.infer<typeof productImageSchema>;

type ProductResponseAssociations = BaseWeightPair & {
	id: string;
	categoryId: string;
	category: { id: string };
	primaryImage: ProductImageResponse | null;
};

type ProductDetailAssociations = ProductResponseAssociations & {
	images: ProductImageResponse[];
	offerings: Array<{ productId: string }>;
};

function validateProductResponse(
	product: ProductResponseAssociations,
	context: z.RefinementCtx,
): void {
	validateBaseWeightPair(product, context);

	if (product.category.id !== product.categoryId) {
		context.addIssue({
			code: "custom",
			path: ["category", "id"],
			message: "Category must belong to the product category ID",
		});
	}
	if (product.primaryImage?.productId !== undefined && product.primaryImage.productId !== product.id) {
		context.addIssue({
			code: "custom",
			path: ["primaryImage", "productId"],
			message: "Primary image must belong to the product",
		});
	}
	if (product.primaryImage !== null && product.primaryImage.displayOrder !== 0) {
		context.addIssue({
			code: "custom",
			path: ["primaryImage", "displayOrder"],
			message: "Primary image must have display order zero",
		});
	}
}

function productImagesMatch(
	left: ProductImageResponse,
	right: ProductImageResponse,
): boolean {
	return (
		left.id === right.id &&
		left.productId === right.productId &&
		left.url === right.url &&
		left.mimeType === right.mimeType &&
		left.byteSize === right.byteSize &&
		left.altText === right.altText &&
		left.displayOrder === right.displayOrder &&
		left.createdAt === right.createdAt
	);
}

function validateProductDetailAssociations(
	product: ProductDetailAssociations,
	context: z.RefinementCtx,
): void {
	const imageIds = new Set<string>();
	const displayOrders = new Set<number>();
	for (const [index, image] of product.images.entries()) {
		if (image.productId !== product.id) {
			context.addIssue({
				code: "custom",
				path: ["images", index, "productId"],
				message: "Image must belong to the product",
			});
		}
		if (imageIds.has(image.id)) {
			context.addIssue({
				code: "custom",
				path: ["images", index, "id"],
				message: "Image IDs must be unique",
			});
		}
		if (displayOrders.has(image.displayOrder)) {
			context.addIssue({
				code: "custom",
				path: ["images", index, "displayOrder"],
				message: "Image display orders must be unique",
			});
		}
		imageIds.add(image.id);
		displayOrders.add(image.displayOrder);
	}

	for (const [index, offering] of product.offerings.entries()) {
		if (offering.productId !== product.id) {
			context.addIssue({
				code: "custom",
				path: ["offerings", index, "productId"],
				message: "Offering must belong to the product",
			});
		}
	}

	if (product.images.length === 0) {
		if (product.primaryImage !== null) {
			context.addIssue({
				code: "custom",
				path: ["primaryImage"],
				message: "Primary image must be null when the gallery is empty",
			});
		}
		return;
	}

	const orderZeroImage = product.images.find((image) => image.displayOrder === 0);
	if (orderZeroImage === undefined) {
		context.addIssue({
			code: "custom",
			path: ["images"],
			message: "A non-empty gallery must contain an order-zero image",
		});
	} else if (
		product.primaryImage === null ||
		!productImagesMatch(product.primaryImage, orderZeroImage)
	) {
		context.addIssue({
			code: "custom",
			path: ["primaryImage"],
			message: "Primary image must match the order-zero gallery image",
		});
	}
}

export const productSummarySchema = z
	.object(productSummaryShape)
	.strict()
	.superRefine(validateProductResponse);

export const productDetailSchema = z
	.object({
		...productSummaryShape,
		tags: z.array(tagSchema),
		images: z.array(productImageSchema).max(5),
		offerings: z.array(offeringSchema),
	})
	.strict()
	.superRefine((product, context) => {
		validateProductResponse(product, context);
		validateProductDetailAssociations(product, context);
	});

export const inventoryMovementSchema = z
	.object({
		id: idSchema,
		offeringId: idSchema,
		previousQuantity: nonnegativeIntegerSchema,
		quantityDelta: z.number().int().refine((value) => value !== 0, {
			message: "Quantity delta must not be zero",
		}),
		resultingQuantity: nonnegativeIntegerSchema,
		reason: z.string().trim().min(1).max(500),
		movementType: z.enum(inventoryMovementTypes),
		actorUserId: idSchema,
		offeringVersion: versionSchema,
		createdAt: timestampSchema,
	})
	.strict()
	.superRefine((movement, context) => {
		if (
			movement.previousQuantity + movement.quantityDelta !==
			movement.resultingQuantity
		) {
			context.addIssue({
				code: "custom",
				path: ["resultingQuantity"],
				message: "Previous quantity plus delta must equal resulting quantity",
			});
		}
	});

export function catalogListResponseSchema<T extends z.ZodType>(itemSchema: T) {
	return z
		.object({
			items: z.array(itemSchema),
			page: z.number().int().min(1),
			pageSize: z.number().int().min(1).max(100),
			totalItems: nonnegativeIntegerSchema,
			totalPages: nonnegativeIntegerSchema,
		})
		.strict();
}

const categoryInputShape = {
	name: nameSchema,
	slug: slugSchema,
	description: nullableDescriptionSchema,
	active: z.boolean(),
};

export const categoryCreateInputSchema = z.object(categoryInputShape).strict();
export const categoryUpdateInputSchema = z.object(categoryInputShape).strict();

const tagInputShape = {
	name: nameSchema,
	slug: slugSchema,
	active: z.boolean(),
};

export const tagCreateInputSchema = z.object(tagInputShape).strict();
export const tagUpdateInputSchema = z.object(tagInputShape).strict();

const productInputShape = {
	code: codeSchema,
	slug: slugSchema,
	name: nameSchema,
	description: descriptionSchema,
	baseWeightValue: nullableWeightValueSchema,
	baseWeightUnit: nullableWeightUnitSchema,
	categoryId: idSchema,
	tagIds: tagIdsSchema,
	active: z.boolean(),
};

export const productCreateInputSchema = z
	.object(productInputShape)
	.strict()
	.superRefine(validateBaseWeightPair);

export const productUpdateInputSchema = z
	.object({ ...productInputShape, version: versionSchema })
	.strict()
	.superRefine(validateBaseWeightPair);

/**
 * Complete product payload used by compatibility consumers that carry an
 * optimistic-concurrency version for both create and update operations.
 * New route code should prefer the explicit create/update schemas above.
 */
export const productInputSchema = productUpdateInputSchema;

const offeringMutableInputShape = {
	sku: codeSchema,
	label: z.string().trim().min(1).max(120),
	...offeringRulesShape,
	lowStockThreshold: nonnegativeIntegerSchema,
	active: z.boolean(),
};

export const offeringCreateInputSchema = z
	.object({ productId: idSchema, ...offeringMutableInputShape })
	.strict()
	.superRefine(validateOfferingRules);

export const offeringUpdateInputSchema = z
	.object({ ...offeringMutableInputShape, version: versionSchema })
	.strict()
	.superRefine(validateOfferingRules);

/**
 * Complete offering payload used by compatibility consumers that include the
 * parent product and an optimistic-concurrency version in one payload.
 * New route code should prefer the explicit create/update schemas above.
 */
export const offeringInputSchema = z
	.object({ productId: idSchema, ...offeringMutableInputShape, version: versionSchema })
	.strict()
	.superRefine(validateOfferingRules);

export const imageUploadMetadataSchema = z
	.object({ altText: z.string().trim().min(1).max(200) })
	.strict();

export const imageReorderInputSchema = z
	.object({
		imageIds: z
			.array(idSchema)
			.min(1)
			.max(5)
			.refine((imageIds) => new Set(imageIds).size === imageIds.length, {
				message: "Image IDs must be unique",
			}),
	})
	.strict();

export const inventoryAdjustmentInputSchema = z
	.object({
		stockQuantity: nonnegativeIntegerSchema,
		reason: z.string().trim().min(1).max(500),
		version: versionSchema,
	})
	.strict();

const cmsCategoryListQueryShape = {
	page: pageSchema,
	pageSize: pageSizeSchema,
	search: optionalSearchSchema,
	active: queryBooleanSchema.optional(),
	sortBy: z.enum(["name", "slug", "active", "updatedAt"]).default("updatedAt"),
	sortDirection: sortDirectionSchema.default("desc"),
};

export const cmsCategoryListQuerySchema = z
	.object(cmsCategoryListQueryShape)
	.strict();

/** Base CMS pagination, filtering, and sorting contract for taxonomy lists. */
export const catalogListQuerySchema = cmsCategoryListQuerySchema;

export const cmsTagListQuerySchema = z
	.object(cmsCategoryListQueryShape)
	.strict();

export const cmsProductListQuerySchema = z
	.object({
		page: pageSchema,
		pageSize: pageSizeSchema,
		search: optionalSearchSchema,
		categoryId: idSchema.optional(),
		tagId: idSchema.optional(),
		active: queryBooleanSchema.optional(),
		sortBy: z.enum(["name", "code", "active", "updatedAt"]).default("updatedAt"),
		sortDirection: sortDirectionSchema.default("desc"),
	})
	.strict();

export const cmsOfferingListQuerySchema = z
	.object({
		page: pageSchema,
		pageSize: pageSizeSchema,
		search: optionalSearchSchema,
		productId: idSchema.optional(),
		active: queryBooleanSchema.optional(),
		inStock: queryBooleanSchema.optional(),
		lowStock: queryBooleanSchema.optional(),
		sortBy: z
			.enum([
				"sku",
				"label",
				"listPriceMinor",
				"effectivePriceMinor",
				"stockQuantity",
				"updatedAt",
			])
			.default("updatedAt"),
		sortDirection: sortDirectionSchema.default("desc"),
	})
	.strict();

export const cmsInventoryMovementListQuerySchema = z
	.object({
		page: pageSchema,
		pageSize: pageSizeSchema,
		offeringId: idSchema.optional(),
		movementType: z.enum(inventoryMovementTypes).optional(),
		actorUserId: idSchema.optional(),
		createdFrom: z.coerce.number().int().nonnegative().optional(),
		createdTo: z.coerce.number().int().nonnegative().optional(),
		sortBy: z.literal("createdAt").default("createdAt"),
		sortDirection: sortDirectionSchema.default("desc"),
	})
	.strict()
	.superRefine((query, context) => {
		if (
			query.createdFrom !== undefined &&
			query.createdTo !== undefined &&
			query.createdFrom > query.createdTo
		) {
			context.addIssue({
				code: "custom",
				path: ["createdTo"],
				message: "End time must not be before start time",
			});
		}
	});

const publicPriceFilterShape = {
	categorySlug: slugSchema.optional(),
	tagSlug: slugSchema.optional(),
	inStock: queryBooleanSchema.optional(),
	minPriceMinor: z.coerce.number().int().nonnegative().optional(),
	maxPriceMinor: z.coerce.number().int().nonnegative().optional(),
};

function validatePriceRange(
	query: { minPriceMinor?: number; maxPriceMinor?: number },
	context: z.RefinementCtx,
): void {
	if (
		query.minPriceMinor !== undefined &&
		query.maxPriceMinor !== undefined &&
		query.minPriceMinor > query.maxPriceMinor
	) {
		context.addIssue({
			code: "custom",
			path: ["maxPriceMinor"],
			message: "Maximum price must not be below minimum price",
		});
	}
}

export const publicProductListQuerySchema = z
	.object({
		page: pageSchema,
		pageSize: pageSizeSchema,
		...publicPriceFilterShape,
		sortBy: z.enum(["name", "price", "newest"]).default("name"),
		sortDirection: sortDirectionSchema.default("asc"),
	})
	.strict()
	.superRefine(validatePriceRange);

export const publicSearchQuerySchema = z
	.object({
		page: pageSchema,
		pageSize: pageSizeSchema,
		search: z.string().trim().min(1).max(100),
		...publicPriceFilterShape,
		sortBy: z.enum(["relevance", "name", "price", "newest"]).default("relevance"),
		sortDirection: sortDirectionSchema.default("desc"),
	})
	.strict()
	.superRefine(validatePriceRange);

export type Category = z.infer<typeof categorySchema>;
export type Tag = z.infer<typeof tagSchema>;
export type ProductSummary = z.infer<typeof productSummarySchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type ProductImage = z.infer<typeof productImageSchema>;
export type Offering = z.infer<typeof offeringSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;

export type CatalogListResponse<T> = z.output<
	ReturnType<typeof catalogListResponseSchema<z.ZodType<T>>>
>;

export type CategoryCreateInput = z.infer<typeof categoryCreateInputSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInputSchema>;
export type CategoryInput = CategoryCreateInput;
export type TagCreateInput = z.infer<typeof tagCreateInputSchema>;
export type TagUpdateInput = z.infer<typeof tagUpdateInputSchema>;
export type TagInput = TagCreateInput;
export type ProductCreateInput = z.infer<typeof productCreateInputSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type OfferingCreateInput = z.infer<typeof offeringCreateInputSchema>;
export type OfferingUpdateInput = z.infer<typeof offeringUpdateInputSchema>;
export type OfferingInput = z.infer<typeof offeringInputSchema>;
export type ImageUploadMetadata = z.infer<typeof imageUploadMetadataSchema>;
export type ImageReorderInput = z.infer<typeof imageReorderInputSchema>;
export type InventoryAdjustmentInput = z.infer<
	typeof inventoryAdjustmentInputSchema
>;

export type CmsCategoryListQuery = z.infer<typeof cmsCategoryListQuerySchema>;
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;
export type CmsTagListQuery = z.infer<typeof cmsTagListQuerySchema>;
export type CmsProductListQuery = z.infer<typeof cmsProductListQuerySchema>;
export type CmsOfferingListQuery = z.infer<typeof cmsOfferingListQuerySchema>;
export type CmsInventoryMovementListQuery = z.infer<
	typeof cmsInventoryMovementListQuerySchema
>;
export type PublicProductListQuery = z.infer<
	typeof publicProductListQuerySchema
>;
export type PublicSearchQuery = z.infer<typeof publicSearchQuerySchema>;
