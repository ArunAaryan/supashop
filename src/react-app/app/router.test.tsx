import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGuestSession } from "./router";
import { useCategories, useProducts } from "../features/catalog/catalog-api";

function CatalogPayloadProbe() {
	const categories = useCategories({ page: 1, pageSize: 20, sortBy: "name", sortDirection: "asc" });
	const products = useProducts({ page: 1, pageSize: 20, sortBy: "name", sortDirection: "asc" });
	if (categories.isError && products.isError) return <p>Malformed catalog payloads rejected</p>;
	return <p>Checking catalog payloads</p>;
}

describe("createGuestSession", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("creates the guest session with included credentials", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ guest: true }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		await createGuestSession();

		expect(fetchMock).toHaveBeenCalledWith("/api/guest/session", {
			credentials: "include",
			method: "POST",
		});
	});

	it("rejects a malformed successful guest response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(JSON.stringify({ guest: false }), { status: 200 })),
		);

		await expect(createGuestSession()).rejects.toThrow(
			"We could not start a guest session. Please try again.",
		);
	});
});

describe("catalog response integration", () => {
	it("rejects malformed successful category and product payloads", async () => {
		vi.stubGlobal("fetch", vi.fn((url: string) => {
			if (url.startsWith("/api/cms/categories?")) return Promise.resolve(new Response(JSON.stringify({ items: [] })));
			if (url.startsWith("/api/cms/products?")) return Promise.resolve(new Response(JSON.stringify({ items: [] })));
			return Promise.reject(new Error(`Unexpected request: ${url}`));
		}));

		render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CatalogPayloadProbe /></QueryClientProvider>);

		expect(await screen.findByText("Malformed catalog payloads rejected")).toBeInTheDocument();
	});
});
