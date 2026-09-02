import {
	catalogListResponseSchema,
	categorySchema,
	productDetailSchema,
	productSummarySchema,
	publicProductListQuerySchema,
	publicSearchQuerySchema,
	tagSchema,
	type CatalogListResponse,
	type Category,
	type ProductDetail,
	type ProductSummary,
	type Tag,
} from "../../../shared/contracts/catalog";
import { calculateEffectivePrice } from "../../../shared/domain/discount";
import { ApiError } from "../../http/errors";
import type { StoredCategory, StoredProductDetail, StoredProductImage, StoredTag } from "./catalog-repository";
import { PublicCatalogRepository } from "./public-repository";

function category(row: StoredCategory): Category {
	return categorySchema.parse({ id: row.id, name: row.name, slug: row.slug, description: row.description, active: Boolean(row.active), productCount: row.product_count, createdAt: row.created_at, updatedAt: row.updated_at });
}

function tag(row: StoredTag): Tag {
	return tagSchema.parse({ id: row.id, name: row.name, slug: row.slug, active: Boolean(row.active), productCount: row.product_count, createdAt: row.created_at, updatedAt: row.updated_at });
}

function image(row: StoredProductImage) {
	return { id: row.id, productId: row.product_id, url: `/api/catalog/images/${row.id}`, mimeType: row.mime_type, byteSize: row.byte_size, altText: row.alt_text, displayOrder: row.display_order, createdAt: row.created_at };
}

function detail(row: StoredProductDetail): ProductDetail {
	const activeOfferings = row.offerings.filter((item) => Boolean(item.active)).map((item) => {
		const price = calculateEffectivePrice(item.list_price_minor, item.discount_type, item.discount_value);
		return { id: item.id, productId: item.product_id, sku: item.sku, label: item.label, packQuantity: item.pack_quantity, weightValue: item.weight_value, weightUnit: item.weight_unit, listPriceMinor: item.list_price_minor, discountType: item.discount_type, discountValue: item.discount_value, ...price, stockQuantity: item.stock_quantity, lowStockThreshold: item.low_stock_threshold, inStock: item.stock_quantity > 0, lowStock: item.stock_quantity <= item.low_stock_threshold, active: true, version: item.version, createdAt: item.created_at, updatedAt: item.updated_at };
	});
	const images = row.images.map(image);
	const minimum = activeOfferings.length ? Math.min(...activeOfferings.map((item) => item.effectivePriceMinor)) : null;
	return productDetailSchema.parse({
		id: row.id, code: row.code, slug: row.slug, name: row.name, description: row.description,
		baseWeightValue: row.base_weight_value, baseWeightUnit: row.base_weight_unit, categoryId: row.category_id,
		category: category(row.category), active: true, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
		primaryImage: images.find((item) => item.displayOrder === 0) ?? null,
		activeOfferingCount: activeOfferings.length, minimumEffectivePriceMinor: minimum,
		hasPromotion: activeOfferings.some((item) => item.discountType !== "none"),
		inStock: activeOfferings.some((item) => item.inStock),
		tags: row.tags.filter((item) => Boolean(item.active)).map(tag), images, offerings: activeOfferings,
	});
}

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
	const result = schema.safeParse(value);
	if (!result.success) throw new ApiError("BAD_REQUEST", "Catalog query is invalid");
	return result.data;
}

export class PublicCatalogService {
	constructor(private readonly repository: PublicCatalogRepository) {}

	async listCategories(): Promise<Category[]> { return (await this.repository.listCategories()).map(category); }
	async listTags(): Promise<Tag[]> { return (await this.repository.listTags()).map(tag); }

	async listProducts(value: unknown): Promise<CatalogListResponse<ProductSummary>> {
		const query = parse(publicProductListQuerySchema, value);
		return this.page(query, await this.repository.listProducts(query));
	}

	async search(value: unknown): Promise<CatalogListResponse<ProductSummary>> {
		const query = parse(publicSearchQuerySchema, value);
		return this.page(query, await this.repository.listProducts(query));
	}

	async getProduct(slug: string): Promise<ProductDetail> {
		const row = await this.repository.getProductBySlug(slug);
		if (!row) throw new ApiError("NOT_FOUND", "Product not found");
		return detail(row);
	}

	private page(query: { page: number; pageSize: number }, page: { items: StoredProductDetail[]; totalItems: number }): CatalogListResponse<ProductSummary> {
		const items = page.items.map((item) => {
			const { tags: _tags, images: _images, offerings: _offerings, ...summary } = detail(item);
			void _tags;
			void _images;
			void _offerings;
			return productSummarySchema.parse(summary);
		});
		return catalogListResponseSchema(productSummarySchema).parse({ items, page: query.page, pageSize: query.pageSize, totalItems: page.totalItems, totalPages: Math.ceil(page.totalItems / query.pageSize) });
	}
}
