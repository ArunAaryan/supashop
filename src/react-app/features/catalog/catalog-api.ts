import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import {
	catalogListResponseSchema,
	categoryCreateInputSchema,
	categorySchema,
	cmsCategoryListQuerySchema,
	cmsProductListQuerySchema,
	cmsTagListQuerySchema,
	cmsInventoryMovementListQuerySchema,
	cmsOfferingListQuerySchema,
	inventoryAdjustmentInputSchema,
	inventoryMovementSchema,
	offeringCreateInputSchema,
	offeringSchema,
	offeringUpdateInputSchema,
	productCreateInputSchema,
	productDetailSchema,
	productImageSchema,
	productSummarySchema,
	productUpdateInputSchema,
	tagCreateInputSchema,
	tagSchema,
	type CatalogListResponse,
	type Category,
	type CategoryCreateInput,
	type CategoryUpdateInput,
	type CmsCategoryListQuery,
	type CmsInventoryMovementListQuery,
	type CmsOfferingListQuery,
	type CmsProductListQuery,
	type CmsTagListQuery,
	type InventoryAdjustmentInput,
	type InventoryMovement,
	type Offering,
	type OfferingCreateInput,
	type OfferingUpdateInput,
	type ProductCreateInput,
	type ProductDetail,
	type ProductImage,
	type ProductSummary,
	type ProductUpdateInput,
	type Tag,
	type TagCreateInput,
	type TagUpdateInput,
} from "../../../shared/contracts/catalog";
import { apiRequest } from "../../lib/api-client";

const inventoryAdjustmentResponseSchema = z.object({ offering: offeringSchema, movement: inventoryMovementSchema }).strict();

export const catalogKeys = {
	categories: (query: CmsCategoryListQuery) => ["cms", "categories", query] as const,
	tags: (query: CmsTagListQuery) => ["cms", "tags", query] as const,
	products: (query: CmsProductListQuery) => ["cms", "products", query] as const,
	product: (productId: string) => ["cms", "products", "detail", productId] as const,
	offerings: (query: CmsOfferingListQuery) => ["cms", "offerings", query] as const,
	offering: (offeringId: string) => ["cms", "offerings", "detail", offeringId] as const,
	movements: (query: CmsInventoryMovementListQuery) => ["cms", "inventory-movements", query] as const,
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

async function requestCategoryPage(query: CmsCategoryListQuery): Promise<CatalogListResponse<Category>> {
	const body = await apiRequest<unknown>(`/api/cms/categories?${queryString(query)}`);
	return parseResponse(catalogListResponseSchema(categorySchema), body, "category list");
}

async function requestTagPage(query: CmsTagListQuery): Promise<CatalogListResponse<Tag>> {
	const body = await apiRequest<unknown>(`/api/cms/tags?${queryString(query)}`);
	return parseResponse(catalogListResponseSchema(tagSchema), body, "tag list");
}

async function requestProductPage(query: CmsProductListQuery): Promise<CatalogListResponse<ProductSummary>> {
	const body = await apiRequest<unknown>(`/api/cms/products?${queryString(query)}`);
	return parseResponse(catalogListResponseSchema(productSummarySchema), body, "product list");
}

async function requestProduct(productId: string): Promise<ProductDetail> {
	const body = await apiRequest<unknown>(`/api/cms/products/${encodeURIComponent(productId)}`);
	return parseResponse(productDetailSchema, body, "product");
}

async function requestOfferingPage(query: CmsOfferingListQuery): Promise<CatalogListResponse<Offering>> {
	const body = await apiRequest<unknown>(`/api/cms/offerings?${queryString(query)}`);
	return parseResponse(catalogListResponseSchema(offeringSchema), body, "offering list");
}

async function requestOffering(offeringId: string): Promise<Offering> {
	const body = await apiRequest<unknown>(`/api/cms/offerings/${encodeURIComponent(offeringId)}`);
	return parseResponse(offeringSchema, body, "offering");
}

async function requestMovementPage(query: CmsInventoryMovementListQuery): Promise<CatalogListResponse<InventoryMovement>> {
	const body = await apiRequest<unknown>(`/api/cms/inventory-movements?${queryString(query)}`);
	return parseResponse(catalogListResponseSchema(inventoryMovementSchema), body, "inventory movement list");
}

export function useCategories(queryValue: CmsCategoryListQuery, enabled = true) {
	const query = cmsCategoryListQuerySchema.parse(queryValue);
	return useQuery({ queryKey: catalogKeys.categories(query), queryFn: () => requestCategoryPage(query), enabled });
}

export function useTags(queryValue: CmsTagListQuery, enabled = true) {
	const query = cmsTagListQuerySchema.parse(queryValue);
	return useQuery({ queryKey: catalogKeys.tags(query), queryFn: () => requestTagPage(query), enabled });
}

export function useProducts(queryValue: CmsProductListQuery) {
	const query = cmsProductListQuerySchema.parse(queryValue);
	return useQuery({ queryKey: catalogKeys.products(query), queryFn: () => requestProductPage(query) });
}

export function useProduct(productId: string | undefined) {
	return useQuery({
		queryKey: catalogKeys.product(productId ?? ""),
		queryFn: () => requestProduct(productId!),
		enabled: Boolean(productId),
	});
}

export function useOfferings(queryValue: CmsOfferingListQuery) {
	const query = cmsOfferingListQuerySchema.parse(queryValue);
	return useQuery({ queryKey: catalogKeys.offerings(query), queryFn: () => requestOfferingPage(query) });
}

export function useOffering(offeringId: string | undefined) {
	return useQuery({
		queryKey: catalogKeys.offering(offeringId ?? ""),
		queryFn: () => requestOffering(offeringId!),
		enabled: Boolean(offeringId),
	});
}

export function useInventoryMovements(queryValue: CmsInventoryMovementListQuery) {
	const query = cmsInventoryMovementListQuerySchema.parse(queryValue);
	return useQuery({ queryKey: catalogKeys.movements(query), queryFn: () => requestMovementPage(query) });
}

export function useCreateCategory() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async (input: CategoryCreateInput) => {
			const body = await apiRequest<unknown>("/api/cms/categories", { method: "POST", body: categoryCreateInputSchema.parse(input) });
			return parseResponse(categorySchema, body, "category");
		},
		onSuccess: () => client.invalidateQueries({ queryKey: ["cms", "categories"] }),
	});
}

export function useUpdateCategory() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: CategoryUpdateInput }) => {
			const body = await apiRequest<unknown>(`/api/cms/categories/${encodeURIComponent(id)}`, { method: "PUT", body: categoryCreateInputSchema.parse(input) });
			return parseResponse(categorySchema, body, "category");
		},
		onSuccess: () => client.invalidateQueries({ queryKey: ["cms", "categories"] }),
	});
}

export function useCreateTag() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async (input: TagCreateInput) => {
			const body = await apiRequest<unknown>("/api/cms/tags", { method: "POST", body: tagCreateInputSchema.parse(input) });
			return parseResponse(tagSchema, body, "tag");
		},
		onSuccess: () => client.invalidateQueries({ queryKey: ["cms", "tags"] }),
	});
}

export function useUpdateTag() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: TagUpdateInput }) => {
			const body = await apiRequest<unknown>(`/api/cms/tags/${encodeURIComponent(id)}`, { method: "PUT", body: tagCreateInputSchema.parse(input) });
			return parseResponse(tagSchema, body, "tag");
		},
		onSuccess: () => client.invalidateQueries({ queryKey: ["cms", "tags"] }),
	});
}

export function useCreateProduct() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async (input: ProductCreateInput) => {
			const body = await apiRequest<unknown>("/api/cms/products", { method: "POST", body: productCreateInputSchema.parse(input) });
			return parseResponse(productDetailSchema, body, "product");
		},
		onSuccess: (product) => {
			client.setQueryData(catalogKeys.product(product.id), product);
			return client.invalidateQueries({ queryKey: ["cms", "products"] });
		},
	});
}

export function useUpdateProduct() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: ProductUpdateInput }) => {
			const body = await apiRequest<unknown>(`/api/cms/products/${encodeURIComponent(id)}`, { method: "PUT", body: productUpdateInputSchema.parse(input) });
			return parseResponse(productDetailSchema, body, "product");
		},
		onSuccess: (product) => {
			client.setQueryData(catalogKeys.product(product.id), product);
			return client.invalidateQueries({ queryKey: ["cms", "products"] });
		},
	});
}

function withImages(product: ProductDetail, images: ProductImage[]): ProductDetail {
	const ordered = [...images].sort((left, right) => left.displayOrder - right.displayOrder);
	return productDetailSchema.parse({
		...product,
		images: ordered,
		primaryImage: ordered[0] ?? null,
	});
}

function updateProductImages(
	client: ReturnType<typeof useQueryClient>,
	productId: string,
	update: (images: ProductImage[]) => ProductImage[],
) {
	client.setQueryData<ProductDetail>(catalogKeys.product(productId), (product) =>
		product ? withImages(product, update(product.images)) : product,
	);
	return client.invalidateQueries({ queryKey: ["cms", "products"] });
}

export function useUploadProductImage() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ productId, file, altText }: { productId: string; file: File; altText: string }) => {
			const form = new FormData();
			form.set("altText", altText);
			form.set("image", file);
			const body = await apiRequest<unknown>(`/api/cms/products/${encodeURIComponent(productId)}/images`, { method: "POST", body: form });
			return parseResponse(productImageSchema, body, "product image");
		},
		onSuccess: (image, variables) => updateProductImages(client, variables.productId, (images) => [...images, image]),
	});
}

export function useReorderProductImages() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ productId, imageIds }: { productId: string; imageIds: string[] }) => {
			const body = await apiRequest<unknown>(`/api/cms/products/${encodeURIComponent(productId)}/images/order`, { method: "PUT", body: { imageIds } });
			if (!Array.isArray(body)) throw new Error("The server returned an invalid product image order response.");
			return body.map((image) => parseResponse(productImageSchema, image, "product image"));
		},
		onSuccess: (images, variables) => updateProductImages(client, variables.productId, () => images),
	});
}

export function useRemoveProductImage() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ productId, imageId }: { productId: string; imageId: string }) => {
			await apiRequest<void>(`/api/cms/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, { method: "DELETE" });
			return imageId;
		},
		onSuccess: (imageId, variables) => updateProductImages(
			client,
			variables.productId,
			(images) => images.filter((image) => image.id !== imageId).map((image, displayOrder) => ({ ...image, displayOrder })),
		),
	});
}

export function useCreateOffering() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async (input: OfferingCreateInput) => {
			const body = await apiRequest<unknown>("/api/cms/offerings", { method: "POST", body: offeringCreateInputSchema.parse(input) });
			return parseResponse(offeringSchema, body, "offering");
		},
		onSuccess: (offering) => {
			client.setQueryData(catalogKeys.offering(offering.id), offering);
			return client.invalidateQueries({ queryKey: ["cms", "offerings"] });
		},
	});
}

export function useUpdateOffering() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: OfferingUpdateInput }) => {
			const body = await apiRequest<unknown>(`/api/cms/offerings/${encodeURIComponent(id)}`, { method: "PUT", body: offeringUpdateInputSchema.parse(input) });
			return parseResponse(offeringSchema, body, "offering");
		},
		onSuccess: (offering) => {
			client.setQueryData(catalogKeys.offering(offering.id), offering);
			return client.invalidateQueries({ queryKey: ["cms", "offerings"] });
		},
	});
}

export function useAdjustInventory() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, input }: { id: string; input: InventoryAdjustmentInput }) => {
			const body = await apiRequest<unknown>(`/api/cms/offerings/${encodeURIComponent(id)}/inventory-adjustments`, { method: "POST", body: inventoryAdjustmentInputSchema.parse(input) });
			return parseResponse(inventoryAdjustmentResponseSchema, body, "inventory adjustment");
		},
		onSuccess: ({ offering }) => {
			client.setQueryData(catalogKeys.offering(offering.id), offering);
			void client.invalidateQueries({ queryKey: ["cms", "offerings"] });
			return client.invalidateQueries({ queryKey: ["cms", "inventory-movements"] });
		},
	});
}
