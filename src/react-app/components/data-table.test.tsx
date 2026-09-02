import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./data-table";

type Product = { id: string; name: string; stock: number };

const columns: ColumnDef<Product>[] = [
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "stock", header: "Stock" },
];

const products: Product[] = [
	{ id: "milk", name: "Milk", stock: 12 },
	{ id: "bread", name: "Bread", stock: 4 },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof DataTable<Product>>> = {}) {
	const onPageChange = vi.fn();
	const onSortingChange = vi.fn<(sorting: SortingState) => void>();
	render(<DataTable
		columns={columns}
		data={products}
		emptyMessage="No products found."
		onPageChange={onPageChange}
		onSortingChange={onSortingChange}
		pageIndex={0}
		pageSize={2}
		rowCount={4}
		sorting={[]}
		{...overrides}
	/>);
	return { onPageChange, onSortingChange };
}

describe("DataTable", () => {
	it("renders columns, cells, sorting, and manual pagination controls", async () => {
		const user = userEvent.setup();
		const { onPageChange, onSortingChange } = renderTable();

		expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
		expect(screen.getByRole("columnheader", { name: /stock/i })).toBeInTheDocument();
		expect(screen.getByText("Milk")).toBeInTheDocument();
		expect(screen.getByText("4")).toBeInTheDocument();
		expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Next page" }));
		expect(onPageChange).toHaveBeenCalledWith(1);
		await user.click(screen.getByRole("button", { name: "Sort by Name" }));
		expect(onSortingChange).toHaveBeenCalledWith([{ id: "name", desc: false }]);
	});

	it("announces loading and displays an empty state", () => {
		const { rerender } = render(<DataTable
			columns={columns}
			data={[]}
			emptyMessage="No products found."
			isLoading
			onPageChange={vi.fn()}
			onSortingChange={vi.fn()}
			pageIndex={0}
			pageSize={20}
			rowCount={0}
			sorting={[]}
		/>);
		expect(screen.getByRole("status")).toHaveTextContent("Loading…");
		expect(screen.getByRole("region")).toHaveAttribute("aria-busy", "true");

		rerender(<DataTable
			columns={columns}
			data={[]}
			emptyMessage="No products found."
			onPageChange={vi.fn()}
			onSortingChange={vi.fn()}
			pageIndex={0}
			pageSize={20}
			rowCount={0}
			sorting={[]}
		/>);
		expect(screen.getByText("No products found.")).toBeInTheDocument();
	});
});
