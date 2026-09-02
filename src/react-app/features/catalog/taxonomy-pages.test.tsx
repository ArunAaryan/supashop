import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoriesPage, TagsPage } from "./taxonomy-pages";

const category = {
	id: "category-1",
	name: "Dairy",
	slug: "dairy",
	description: "Chilled goods",
	active: true,
	productCount: 2,
	createdAt: 1,
	updatedAt: 1,
};

const tag = {
	id: "tag-1",
	name: "Organic",
	slug: "organic",
	active: false,
	productCount: 1,
	createdAt: 1,
	updatedAt: 1,
};

function page(items: unknown[]) {
	return { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 };
}

function renderPage(pageElement: React.ReactNode, initialEntry = "/cms/categories") {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}>{pageElement}</MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("taxonomy pages", () => {
	it("renders URL-backed category search and an operational category table", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page([category]))));
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<CategoriesPage />, "/cms/categories?page=1&pageSize=20&q=milk&sort=name&direction=desc");

		expect(await screen.findByText("Dairy")).toBeInTheDocument();
		expect(screen.getByText("2 products")).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: /search categories/i })).toHaveValue("milk");
		expect(fetchMock.mock.calls[0]?.[0]).toContain("search=milk");
		expect(fetchMock.mock.calls[0]?.[0]).toContain("sortBy=name");

		await user.clear(screen.getByRole("textbox", { name: /search categories/i }));
		await user.type(screen.getByRole("textbox", { name: /search categories/i }), "dairy");
		await user.click(screen.getByRole("button", { name: /^search$/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock.mock.calls[1]?.[0]).toContain("search=dairy");
	});

	it("validates taxonomy input before creating and displays field errors returned by the API", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(page([]))))
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Category is invalid", details: { issues: [{ path: "slug", message: "Use lowercase letters" }] } } }), { status: 422 }));
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<CategoriesPage />);

		await screen.findByText(/no categories match/i);
		await user.click(screen.getByRole("button", { name: /new category/i }));
		await user.type(screen.getByLabelText(/^name$/i), " Dairy ");
		await user.type(screen.getByLabelText(/^slug$/i), "Dairy");
		await user.click(screen.getByRole("button", { name: /create category/i }));

		await screen.findByText("Use lowercase letters");
		expect(fetchMock).toHaveBeenLastCalledWith("/api/cms/categories", expect.objectContaining({
			method: "POST",
			body: JSON.stringify({ name: "Dairy", slug: "dairy", description: null, active: true }),
		}));
	});

	it("edits tags and retains a conflict message from the server", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(page([tag]))))
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "CONFLICT", message: "Tag name or slug already exists" } }), { status: 409 }));
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<TagsPage />, "/cms/tags");

		await screen.findByText("Organic");
		await user.click(screen.getByRole("button", { name: /^edit$/i }));
		const name = screen.getByRole("textbox", { name: /^name$/i });
		await user.clear(name);
		await user.type(name, "Organic farm");
		await user.click(screen.getByRole("button", { name: /save tag/i }));

		expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
		expect(name).toHaveValue("Organic farm");
		expect(fetchMock).toHaveBeenLastCalledWith("/api/cms/tags/tag-1", expect.objectContaining({ method: "PUT" }));
	});
});
