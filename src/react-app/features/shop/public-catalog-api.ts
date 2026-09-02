import { useQuery } from "@tanstack/react-query";

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
	type PublicProductListQuery,
	type PublicSearchQuery,
	type Tag,
} from "../../../shared/contracts/catalog";
import { apiRequest } from "../../lib/api-client";

export const publicCatalogKeys = {
	categories: ["public-catalog", "categories"] as const,
	tags: ["public-catalog", "tags"] as const,
	products: (query: PublicProductListQuery) => ["public-catalog", "products", query] as const,
	search: (query: PublicSearchQuery) => ["public-catalog", "search", query] as const,
	product: (slug: string) => ["public-catalog", "product", slug] as const,
};

function parseResponse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown, label: string): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new Error(`The server returned an invalid ${label} response.`);
	return parsed.data;
}

function queryString(query: Record<string, unknown>) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== null) params.set(key, String(value));
	}
	return params.toString();
}

async function requestCategories(): Promise<Category[]> {
	return parseResponse(categorySchema.array(), await apiRequest<unknown>("/api/catalog/categories"), "category list");
}

async function requestTags(): Promise<Tag[]> {
	return parseResponse(tagSchema.array(), await apiRequest<unknown>("/api/catalog/tags"), "tag list");
}

async function requestProducts(query: PublicProductListQuery): Promise<CatalogListResponse<ProductSummary>> {
	return parseResponse(catalogListResponseSchema(productSummarySchema), await apiRequest<unknown>(`/api/catalog/products?${queryString(query)}`), "product list");
}

async function requestSearch(query: PublicSearchQuery): Promise<CatalogListResponse<ProductSummary>> {
	return parseResponse(catalogListResponseSchema(productSummarySchema), await apiRequest<unknown>(`/api/catalog/search?${queryString(query)}`), "search results");
}

async function requestProduct(slug: string): Promise<ProductDetail> {
	return parseResponse(productDetailSchema, await apiRequest<unknown>(`/api/catalog/products/${encodeURIComponent(slug)}`), "product");
}

export function usePublicCategories() {
	return useQuery({ queryKey: publicCatalogKeys.categories, queryFn: requestCategories });
}

export function usePublicTags() {
	return useQuery({ queryKey: publicCatalogKeys.tags, queryFn: requestTags });
}

export function usePublicProducts(value: PublicProductListQuery) {
	const query = publicProductListQuerySchema.parse(value);
	return useQuery({ queryKey: publicCatalogKeys.products(query), queryFn: () => requestProducts(query) });
}

export function usePublicSearch(value: PublicSearchQuery | undefined) {
	const query = value === undefined ? undefined : publicSearchQuerySchema.parse(value);
	return useQuery({
		queryKey: publicCatalogKeys.search(query ?? { search: "" } as PublicSearchQuery),
		queryFn: () => requestSearch(query!),
		enabled: query !== undefined,
	});
}

export function usePublicProduct(slug: string | undefined) {
	return useQuery({
		queryKey: publicCatalogKeys.product(slug ?? ""),
		queryFn: () => requestProduct(slug!),
		enabled: Boolean(slug),
	});
}
