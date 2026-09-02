import {
	catalogListResponseSchema,
	categoryCreateInputSchema,
	categorySchema,
	categoryUpdateInputSchema,
	cmsCategoryListQuerySchema,
	cmsProductListQuerySchema,
	cmsTagListQuerySchema,
	offeringSchema,
	productCreateInputSchema,
	productDetailSchema,
	productImageSchema,
	productSummarySchema,
	productUpdateInputSchema,
	tagCreateInputSchema,
	tagSchema,
	tagUpdateInputSchema,
	type Category,
	type CatalogListResponse,
	type Offering,
	type ProductDetail,
	type ProductImage,
	type ProductSummary,
	type Tag,
} from "../../../shared/contracts/catalog";
import { calculateEffectivePrice } from "../../../shared/domain/discount";
import { ApiError } from "../../http/errors";
import {
	CatalogRepository,
	type StoredCategory,
	type StoredOffering,
	type StoredProduct,
	type StoredProductDetail,
	type StoredProductImage,
	type StoredTag,
} from "./catalog-repository";

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
	return { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
}

function parseOrThrow<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, value: unknown, message: string): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new ApiError("VALIDATION_ERROR", message, issues(parsed.error));
	return parsed.data;
}

function categoryFromRow(row: StoredCategory): Category {
	return categorySchema.parse({
		id: row.id,
		name: row.name,
		slug: row.slug,
		description: row.description,
		active: Boolean(row.active),
		productCount: row.product_count,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
}

function tagFromRow(row: StoredTag): Tag {
	return tagSchema.parse({
		id: row.id,
		name: row.name,
		slug: row.slug,
		active: Boolean(row.active),
		productCount: row.product_count,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
}

function productImageFromRow(row: StoredProductImage): ProductImage {
	return productImageSchema.parse({
		id: row.id,
		productId: row.product_id,
		url: `/api/catalog/images/${row.id}`,
		mimeType: row.mime_type,
		byteSize: row.byte_size,
		altText: row.alt_text,
		displayOrder: row.display_order,
		createdAt: row.created_at,
	});
}

function offeringFromRow(row: StoredOffering): Offering {
	const price = calculateEffectivePrice(row.list_price_minor, row.discount_type, row.discount_value);
	return offeringSchema.parse({
		id: row.id,
		productId: row.product_id,
		sku: row.sku,
		label: row.label,
		packQuantity: row.pack_quantity,
		weightValue: row.weight_value,
		weightUnit: row.weight_unit,
		listPriceMinor: row.list_price_minor,
		discountType: row.discount_type,
		discountValue: row.discount_value,
		discountMinor: price.discountMinor,
		effectivePriceMinor: price.effectivePriceMinor,
		stockQuantity: row.stock_quantity,
		lowStockThreshold: row.low_stock_threshold,
		inStock: row.stock_quantity > 0,
		lowStock: row.stock_quantity <= row.low_stock_threshold,
		active: Boolean(row.active),
		version: row.version,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
}

function productSummaryFromRow(row: StoredProduct): ProductSummary {
	return productSummarySchema.parse({
		id: row.id,
		code: row.code,
		slug: row.slug,
		name: row.name,
		description: row.description,
		baseWeightValue: row.base_weight_value,
		baseWeightUnit: row.base_weight_unit,
		categoryId: row.category_id,
		category: categoryFromRow(row.category),
		primaryImage: row.primary_image ? productImageFromRow(row.primary_image) : null,
		activeOfferingCount: row.active_offering_count,
		minimumEffectivePriceMinor: row.minimum_effective_price_minor,
		hasPromotion: Boolean(row.has_promotion),
		inStock: Boolean(row.in_stock),
		active: Boolean(row.active),
		version: row.version,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
}

function productDetailFromRow(row: StoredProductDetail): ProductDetail {
	return productDetailSchema.parse({
		...productSummaryFromRow(row),
		tags: row.tags.map(tagFromRow),
		images: row.images.map(productImageFromRow),
		offerings: row.offerings.map(offeringFromRow),
	});
}

function isUniqueFailure(error: unknown): boolean {
	return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export class CatalogService {
	constructor(private readonly repository: CatalogRepository) {}

	async listCategories(queryValue: unknown): Promise<CatalogListResponse<Category>> {
		const query = parseOrThrow(cmsCategoryListQuerySchema, queryValue, "Category query is invalid");
		const page = await this.repository.listCategories(query);
		return catalogListResponseSchema(categorySchema).parse({
			items: page.items.map(categoryFromRow),
			page: query.page,
			pageSize: query.pageSize,
			totalItems: page.totalItems,
			totalPages: Math.ceil(page.totalItems / query.pageSize),
		});
	}

	async createCategory(payload: unknown): Promise<Category> {
		const input = parseOrThrow(categoryCreateInputSchema, payload, "Category is invalid");
		try {
			return categoryFromRow(await this.repository.createCategory(input));
		} catch (error) {
			if (isUniqueFailure(error)) throw new ApiError("CONFLICT", "Category name or slug already exists");
			throw error;
		}
	}

	async updateCategory(id: string, payload: unknown): Promise<Category> {
		const input = parseOrThrow(categoryUpdateInputSchema, payload, "Category is invalid");
		if (!input.active && await this.repository.countActiveProductsForCategory(id) > 0) {
			throw new ApiError("CONFLICT", "Category has active products and cannot be deactivated");
		}
		try {
			const category = await this.repository.updateCategory(id, input);
			if (!category) throw new ApiError("NOT_FOUND", "Category not found");
			return categoryFromRow(category);
		} catch (error) {
			if (isUniqueFailure(error)) throw new ApiError("CONFLICT", "Category name or slug already exists");
			throw error;
		}
	}

	async listTags(queryValue: unknown): Promise<CatalogListResponse<Tag>> {
		const query = parseOrThrow(cmsTagListQuerySchema, queryValue, "Tag query is invalid");
		const page = await this.repository.listTags(query);
		return catalogListResponseSchema(tagSchema).parse({
			items: page.items.map(tagFromRow),
			page: query.page,
			pageSize: query.pageSize,
			totalItems: page.totalItems,
			totalPages: Math.ceil(page.totalItems / query.pageSize),
		});
	}

	async createTag(payload: unknown): Promise<Tag> {
		const input = parseOrThrow(tagCreateInputSchema, payload, "Tag is invalid");
		try {
			return tagFromRow(await this.repository.createTag(input));
		} catch (error) {
			if (isUniqueFailure(error)) throw new ApiError("CONFLICT", "Tag name or slug already exists");
			throw error;
		}
	}

	async updateTag(id: string, payload: unknown): Promise<Tag> {
		const input = parseOrThrow(tagUpdateInputSchema, payload, "Tag is invalid");
		try {
			const tag = await this.repository.updateTag(id, input);
			if (!tag) throw new ApiError("NOT_FOUND", "Tag not found");
			return tagFromRow(tag);
		} catch (error) {
			if (isUniqueFailure(error)) throw new ApiError("CONFLICT", "Tag name or slug already exists");
			throw error;
		}
	}

	async listProducts(queryValue: unknown): Promise<CatalogListResponse<ProductSummary>> {
		const query = parseOrThrow(cmsProductListQuerySchema, queryValue, "Product query is invalid");
		const page = await this.repository.listProducts(query);
		return catalogListResponseSchema(productSummarySchema).parse({
			items: page.items.map(productSummaryFromRow),
			page: query.page,
			pageSize: query.pageSize,
			totalItems: page.totalItems,
			totalPages: Math.ceil(page.totalItems / query.pageSize),
		});
	}

	async getProduct(id: string): Promise<ProductDetail> {
		const product = await this.repository.getProduct(id);
		if (!product) throw new ApiError("NOT_FOUND", "Product not found");
		return productDetailFromRow(product);
	}

	async createProduct(payload: unknown): Promise<ProductDetail> {
		const input = parseOrThrow(productCreateInputSchema, payload, "Product is invalid");
		await this.validateProductTaxonomy(input, null);
		try {
			const product = await this.repository.createProduct(input);
			if (!product) throw new ApiError("CONFLICT", "Product could not be created");
			return productDetailFromRow(product);
		} catch (error) {
			if (isUniqueFailure(error)) throw new ApiError("CONFLICT", "Product code or slug already exists");
			throw error;
		}
	}

	async updateProduct(id: string, payload: unknown): Promise<ProductDetail> {
		const input = parseOrThrow(productUpdateInputSchema, payload, "Product is invalid");
		if (!await this.repository.getProduct(id)) throw new ApiError("NOT_FOUND", "Product not found");
		await this.validateProductTaxonomy(input, id);
		try {
			const product = await this.repository.updateProduct(id, input);
			if (!product) throw new ApiError("CONFLICT", "Product has changed. Reload and try again.");
			return productDetailFromRow(product);
		} catch (error) {
			if (isUniqueFailure(error)) throw new ApiError("CONFLICT", "Product code or slug already exists");
			throw error;
		}
	}

	private async validateProductTaxonomy(
		input: { categoryId: string; tagIds: string[]; active: boolean },
		productId: string | null,
	): Promise<void> {
		const [category, tags] = await Promise.all([
			this.repository.getProductCategory(input.categoryId),
			this.repository.getTagsByIds(input.tagIds),
		]);
		if (!category) throw new ApiError("NOT_FOUND", "Category not found");
		if (tags.length !== input.tagIds.length || tags.some((tag) => !tag.active)) {
			throw new ApiError("VALIDATION_ERROR", "Product tags must exist and be active", {
				issues: [{ path: "tagIds", message: "Tags must exist and be active" }],
			});
		}
		if (!input.active) return;
		if (!category.active) throw new ApiError("CONFLICT", "Active products require an active category");
		if (productId === null || !await this.repository.hasActiveOffering(productId)) {
			throw new ApiError("CONFLICT", "Active products require an active offering");
		}
	}
}
