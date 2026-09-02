import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CmsShell } from "./cms-shell";
import { CustomerShell } from "./customer-shell";

describe("application shells", () => {
	it("gives the customer experience a labelled mobile bottom navigation", () => {
		render(<MemoryRouter><CustomerShell><p>Shop</p></CustomerShell></MemoryRouter>);
		expect(screen.getByRole("navigation", { name: /customer navigation/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /account/i })).toHaveAttribute("href", "/account");
		expect(screen.getByRole("navigation", { name: /customer navigation/i })).not.toHaveClass("overflow-x-hidden");
	});

	it.each(["owner", "admin", "operations"] as const)("exposes Phase 2 catalog navigation to %s", (role) => {
		render(<MemoryRouter><CmsShell role={role}><p>CMS</p></CmsShell></MemoryRouter>);
		expect(screen.getByRole("navigation", { name: /CMS navigation/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/cms/products");
		expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute("href", "/cms/categories");
		expect(screen.getByRole("link", { name: "Tags" })).toHaveAttribute("href", "/cms/tags");
		expect(screen.getByRole("link", { name: "Offerings" })).toHaveAttribute("href", "/cms/offerings");
		expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute("href", "/cms/inventory");
	});

	it("keeps the delivery navigation compact and excludes Phase 2 catalog links", () => {
		render(<MemoryRouter><CmsShell role="delivery"><p>CMS</p></CmsShell></MemoryRouter>);
		expect(screen.getByRole("navigation", { name: /delivery navigation/i })).toBeInTheDocument();
		for (const label of ["Products", "Categories", "Tags", "Offerings", "Inventory"]) {
			expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
		}
	});
});
