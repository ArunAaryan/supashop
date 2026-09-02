import { useMemo, type FormEvent } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Link, useSearchParams } from "react-router-dom";

import { cmsProductListQuerySchema, type CmsProductListQuery, type ProductSummary } from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { DataTable } from "../../components/data-table";
import { Field } from "../../components/field";
import { readListState, writeListState, type ListState } from "./list-state";
import { useProducts } from "./catalog-api";

const formatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function queryFromState(state: ListState): CmsProductListQuery {
	return cmsProductListQuerySchema.parse({
		page: state.page,
		pageSize: state.pageSize,
		search: state.q,
		sortBy: state.sort ?? "updatedAt",
		sortDirection: state.sort ? state.direction : "desc",
	});
}

function ProductImage({ product }: { product: ProductSummary }) {
	if (!product.primaryImage) return <span aria-label="No product image" className="grid size-11 place-items-center rounded-xl border border-dashed border-line bg-[#f7fbfd] text-xs font-medium text-muted">—</span>;
	return <img alt="" className="size-11 rounded-xl border border-line object-cover" src={product.primaryImage.url} />;
}

export function ProductsPage() {
	const [params, setParams] = useSearchParams();
	const state = useMemo(() => readListState(params), [params]);
	const query = useMemo(() => queryFromState(state), [state]);
	const products = useProducts(query);
	const updateState = (next: ListState) => setParams(writeListState(next));
	const sorting: SortingState = state.sort ? [{ id: state.sort, desc: state.direction === "desc" }] : [];
	const columns = useMemo<ColumnDef<ProductSummary, unknown>[]>(() => [
		{ id: "image", header: "", cell: ({ row }) => <ProductImage product={row.original} /> },
		{ accessorKey: "code", header: "Code", enableSorting: true, cell: ({ row }) => <code className="text-xs font-medium">{row.original.code}</code> },
		{ accessorKey: "name", header: "Product", enableSorting: true, cell: ({ row }) => <Link className="font-medium underline-offset-4 hover:underline" to={`/cms/products/${row.original.id}`}>{row.original.name}</Link> },
		{ id: "category", header: "Category", cell: ({ row }) => row.original.category.name },
		{ id: "activeOfferingCount", header: "Active offerings", cell: ({ row }) => row.original.activeOfferingCount },
		{ accessorKey: "active", header: "Status", enableSorting: true, cell: ({ row }) => <span className={`rounded-full px-3 py-1 text-xs font-medium ${row.original.active ? "bg-[#e7f5df] text-[#28633e]" : "bg-[#f2f8fb] text-[#4f8194]"}`}>{row.original.active ? "Active" : "Draft"}</span> },
		{ accessorKey: "updatedAt", header: "Updated", enableSorting: true, cell: ({ row }) => formatter.format(row.original.updatedAt) },
	], []);
	const search = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = new FormData(event.currentTarget).get("search");
		updateState({ ...state, page: 1, q: typeof value === "string" ? value : undefined });
	};

	if (products.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium">Products could not load.</h1><p className="mt-2 text-sm text-muted">{products.error.message}</p><Button className="mt-5" onClick={() => void products.refetch()} variant="secondary">Retry</Button></section>;

	return <div className="mx-auto max-w-7xl space-y-5">
		<header className="rounded-card bg-ink p-5 text-surface shadow-float sm:flex sm:items-end sm:justify-between sm:p-7"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Catalog master records</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Products start with a clear shelf story.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-surface/70">Set the record, category, tags, and readiness before creating customer-facing offerings.</p></div><Link className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-action px-5 text-sm font-medium text-ink shadow-[0_8px_0_#a5d2e2] transition hover:-translate-y-0.5 sm:mt-0" to="/cms/products/new">New product</Link></header>
		<section className="rounded-card border border-white/70 bg-surface p-5 shadow-float"><form className="flex flex-col gap-3 sm:flex-row" onSubmit={search}><Field defaultValue={state.q} label="Search products" name="search" placeholder="Search products…" wrapperClassName="flex-1" /><Button className="sm:self-end" type="submit" variant="secondary">Search</Button></form></section>
		<DataTable columns={columns} data={products.data?.items ?? []} emptyMessage="No products match this view." isLoading={products.isPending || products.isFetching} onPageChange={(pageIndex) => updateState({ ...state, page: pageIndex + 1 })} onSortingChange={(next) => {
			const first = next[0];
			updateState({ ...state, page: 1, sort: first?.id, direction: first?.desc ? "desc" : "asc" });
		}} pageIndex={state.page - 1} pageSize={state.pageSize} rowCount={products.data?.totalItems ?? 0} sorting={sorting} />
	</div>;
}
