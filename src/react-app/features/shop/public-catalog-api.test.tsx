import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePublicCategories, usePublicProduct, usePublicProducts } from "./public-catalog-api";

function MalformedResponseProbe() {
	const categories = usePublicCategories();
	const products = usePublicProducts({ page: 1, pageSize: 20, sortBy: "name", sortDirection: "asc" });
	const product = usePublicProduct("whole-milk");
	if (categories.isError && products.isError && product.isError) return <p>Malformed public catalog payloads rejected</p>;
	return <p>Checking public catalog payloads</p>;
}

describe("public catalog API hooks", () => {
	it("rejects malformed successful API payloads", async () => {
		vi.stubGlobal("fetch", vi.fn((url: string) => {
			if (url === "/api/catalog/categories") return Promise.resolve(new Response(JSON.stringify({ items: [] })));
			if (url.startsWith("/api/catalog/products/")) return Promise.resolve(new Response(JSON.stringify({ id: "broken" })));
			if (url.startsWith("/api/catalog/products?")) return Promise.resolve(new Response(JSON.stringify({ items: [] })));
			return Promise.reject(new Error(`Unexpected request: ${url}`));
		}));
		render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MalformedResponseProbe /></QueryClientProvider>);
		expect(await screen.findByText("Malformed public catalog payloads rejected")).toBeInTheDocument();
	});
});
