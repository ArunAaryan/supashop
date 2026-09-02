import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	type ColumnDef,
	type PaginationState,
	type SortingState,
	type Updater,
} from "@tanstack/react-table";

export type DataTableProps<TData extends object> = {
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	rowCount: number;
	pageIndex: number;
	pageSize: number;
	sorting: SortingState;
	onPageChange: (pageIndex: number) => void;
	onSortingChange: (sorting: SortingState) => void;
	isLoading?: boolean;
	emptyMessage: string;
};

function resolveUpdate<T>(update: Updater<T>, current: T): T {
	return typeof update === "function" ? (update as (old: T) => T)(current) : update;
}

function headerLabel(header: string | undefined, fallback: string) {
	return header?.trim() || fallback;
}

export function DataTable<TData extends object>({
	columns,
	data,
	rowCount,
	pageIndex,
	pageSize,
	sorting,
	onPageChange,
	onSortingChange,
	isLoading = false,
	emptyMessage,
}: DataTableProps<TData>) {
	const pagination: PaginationState = { pageIndex, pageSize };
	const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
	const table = useReactTable({
		data,
		columns,
		rowCount,
		pageCount,
		state: { pagination, sorting },
		manualPagination: true,
		manualSorting: true,
		onPaginationChange: (update) => {
			const next = resolveUpdate(update, pagination);
			if (next.pageIndex !== pageIndex) onPageChange(next.pageIndex);
		},
		onSortingChange: (update) => onSortingChange(resolveUpdate(update, sorting)),
		getCoreRowModel: getCoreRowModel(),
	});

	const visibleColumnCount = Math.max(1, table.getVisibleLeafColumns().length);
	const rows = table.getRowModel().rows;

	return <section aria-busy={isLoading} aria-label="Data table" className="overflow-hidden rounded-card border border-white/70 bg-surface shadow-float">
		{isLoading ? <p className="px-5 pt-5 text-sm font-medium text-muted" role="status">Loading…</p> : null}
		<div className="overflow-x-auto">
			<table className="min-w-full border-collapse text-left text-sm">
				<thead className="border-b border-line bg-[#f7fbfd] text-xs uppercase tracking-[0.08em] text-muted">
					{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>
						{headerGroup.headers.map((header) => {
							if (header.isPlaceholder) return <th key={header.id} scope="col" />;
							const canSort = header.column.getCanSort();
							const sorted = header.column.getIsSorted();
							const title = typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : undefined;
							return <th className="whitespace-nowrap px-5 py-3 font-medium" key={header.id} scope="col">
								{canSort ? <button aria-label={`Sort by ${headerLabel(title, header.column.id)}`} aria-pressed={sorted !== false} className="inline-flex items-center gap-1 text-left font-medium hover:text-ink" onClick={header.column.getToggleSortingHandler()} type="button">
									{flexRender(header.column.columnDef.header, header.getContext())}
									<span aria-hidden="true">{sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}</span>
								</button> : flexRender(header.column.columnDef.header, header.getContext())}
							</th>;
						})}
					</tr>)}
				</thead>
				<tbody className="divide-y divide-line">
					{rows.map((row) => <tr className="hover:bg-[#f2f8fb]" key={row.id}>
						{row.getVisibleCells().map((cell) => <td className="whitespace-nowrap px-5 py-4 text-ink" key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
					</tr>)}
					{!isLoading && rows.length === 0 ? <tr><td className="px-5 py-8 text-center text-muted" colSpan={visibleColumnCount}>{emptyMessage}</td></tr> : null}
				</tbody>
			</table>
		</div>
		<footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 text-sm">
			<p aria-live="polite" className="font-medium">Page {pageIndex + 1} of {pageCount}</p>
			<div className="flex gap-2">
				<button aria-label="Previous page" className="min-h-11 rounded-full border border-line px-4 font-medium hover:bg-[#f7fbfd] disabled:cursor-not-allowed disabled:opacity-60" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} type="button">Previous</button>
				<button aria-label="Next page" className="min-h-11 rounded-full border border-line px-4 font-medium hover:bg-[#f7fbfd] disabled:cursor-not-allowed disabled:opacity-60" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} type="button">Next</button>
			</div>
		</footer>
	</section>;
}
