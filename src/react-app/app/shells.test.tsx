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
	});

	it("gives CMS users a desktop sidebar and delivery users a compact delivery nav", () => {
		const { rerender } = render(<MemoryRouter><CmsShell role="owner"><p>CMS</p></CmsShell></MemoryRouter>);
		expect(screen.getByRole("navigation", { name: /CMS navigation/i })).toBeInTheDocument();

		rerender(<MemoryRouter><CmsShell role="delivery"><p>CMS</p></CmsShell></MemoryRouter>);
		expect(screen.getByRole("navigation", { name: /delivery navigation/i })).toBeInTheDocument();
	});
});
