import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductDetail, ProductImage } from "../../../shared/contracts/catalog";
import { catalogKeys } from "./catalog-api";
import { ProductGallery } from "./product-gallery";

function image(number: number): ProductImage {
	return {
		id: `image-${number}`,
		productId: "product-1",
		url: `/api/catalog/images/image-${number}`,
		mimeType: "image/png",
		byteSize: 9,
		altText: `Milk image ${number}`,
		displayOrder: number,
		createdAt: 1,
	};
}

function product(images: ProductImage[] = []): ProductDetail {
	return {
		id: "product-1",
		code: "MILK-1",
		slug: "milk-1",
		name: "Whole milk",
		description: "Fresh milk",
		baseWeightValue: null,
		baseWeightUnit: null,
		categoryId: "category-1",
		category: { id: "category-1", name: "Dairy", slug: "dairy", description: null, active: true, productCount: 1, createdAt: 1, updatedAt: 1 },
		active: false,
		version: 1,
		createdAt: 1,
		updatedAt: 1,
		primaryImage: images.find((candidate) => candidate.displayOrder === 0) ?? null,
		activeOfferingCount: 0,
		minimumEffectivePriceMinor: null,
		hasPromotion: false,
		inStock: false,
		tags: [],
		images,
		offerings: [],
	};
}

function renderGallery(value: ProductDetail) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(catalogKeys.product(value.id), value);
	return {
		client,
		user: userEvent.setup(),
		...render(<QueryClientProvider client={client}><ProductGallery product={value} /></QueryClientProvider>),
	};
}

afterEach(() => vi.unstubAllGlobals());

describe("ProductGallery", () => {
	it("marks the primary image, offers ordering controls, and caps the gallery at five images", () => {
		renderGallery(product([image(0), image(1), image(2), image(3), image(4)]));
		expect(screen.getByText("Primary")).toBeInTheDocument();
		expect(screen.getByText(/maximum of five images reached/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/image file/i)).toBeDisabled();
		expect(screen.getAllByRole("button", { name: "Move left" })).toHaveLength(5);
		expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(5);
	});

	it("uploads multipart data and updates the product detail cache", async () => {
		const uploaded = image(0);
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(uploaded)));
		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal("URL", { createObjectURL: () => "blob:preview", revokeObjectURL: vi.fn() });
		const { client, user } = renderGallery(product());
		const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], "milk.png", { type: "image/png" });

		await user.upload(screen.getByLabelText(/image file/i), file);
		expect(screen.getByAltText("Selected image preview")).toBeInTheDocument();
		await user.type(screen.getByLabelText(/alt text/i), "Bottle of milk");
		await user.click(screen.getByRole("button", { name: /upload image/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith("/api/cms/products/product-1/images", expect.objectContaining({
			method: "POST",
			body: expect.any(FormData),
		}));
		const cached = client.getQueryData<ProductDetail>(catalogKeys.product("product-1"));
		expect(cached?.images).toEqual([uploaded]);
		expect(cached?.primaryImage).toEqual(uploaded);
	});

	it("keeps server validation feedback near the upload controls", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
			error: { code: "VALIDATION_ERROR", message: "Image metadata is invalid", details: { issues: [{ path: "altText", message: "Describe the bottle" }] } },
		}), { status: 422 })));
		const { user } = renderGallery(product());
		const file = new File([new Uint8Array([1])], "milk.png", { type: "image/png" });

		await user.upload(screen.getByLabelText(/image file/i), file);
		await user.type(screen.getByLabelText(/alt text/i), "Milk");
		await user.click(screen.getByRole("button", { name: /upload image/i }));
		expect(await screen.findByText("Describe the bottle")).toBeInTheDocument();
	});
});
