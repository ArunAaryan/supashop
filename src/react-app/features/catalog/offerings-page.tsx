import { useMemo, type FormEvent } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Link, useSearchParams } from "react-router-dom";

import { cmsOfferingListQuerySchema, type CmsOfferingListQuery, type Offering } from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { DataTable } from "../../components/data-table";
import { Field } from "../../components/field";
import { formatMoney } from "../../lib/format-money";
import { useOfferings } from "./catalog-api";
import { readListState, writeListState, type ListState } from "./list-state";

function queryFromState(state: ListState): CmsOfferingListQuery {
	return cmsOfferingListQuerySchema.parse({ page: state.page, pageSize: state.pageSize, search: state.q, sortBy: state.sort ?? "updatedAt", sortDirection: state.sort ? state.direction : "desc" });
}

function packLabel(offering: Offering) {
	const parts = [offering.packQuantity ? `${offering.packQuantity} pack` : null, offering.weightValue && offering.weightUnit ? `${offering.weightValue} ${offering.weightUnit}` : null].filter(Boolean);
	return parts.join(" · ") || "—";
}

export function OfferingsPage() {
	const [params, setParams] = useSearchParams();
	const state = useMemo(() => readListState(params), [params]);
	const query = useMemo(() => queryFromState(state), [state]);
	const offerings = useOfferings(query);
	const updateState = (next: ListState) => setParams(writeListState(next));
	const sorting: SortingState = state.sort ? [{ id: state.sort, desc: state.direction === "desc" }] : [];
	const columns = useMemo<ColumnDef<Offering, unknown>[]>(() => [
		{ accessorKey: "sku", header: "SKU", enableSorting: true, cell: ({ row }) => <Link className="font-medium underline-offset-4 hover:underline" to={`/cms/offerings/${row.original.id}`}>{row.original.sku}</Link> },
		{ accessorKey: "label", header: "Pack", enableSorting: true, cell: ({ row }) => <span><strong>{row.original.label}</strong><br /><small className="text-muted">{packLabel(row.original)}</small></span> },
		{ accessorKey: "listPriceMinor", header: "List price", enableSorting: true, cell: ({ row }) => formatMoney(row.original.listPriceMinor) },
		{ accessorKey: "effectivePriceMinor", header: "Effective price", enableSorting: true, cell: ({ row }) => <span className="font-medium">{formatMoney(row.original.effectivePriceMinor)}</span> },
		{ accessorKey: "stockQuantity", header: "Stock", enableSorting: true, cell: ({ row }) => <span className={row.original.lowStock ? "font-medium text-[#4f8194]" : "font-medium"}>{row.original.stockQuantity}{row.original.lowStock ? " · Low" : ""}</span> },
		{ accessorKey: "active", header: "Status", cell: ({ row }) => <span className={`rounded-full px-3 py-1 text-xs font-medium ${row.original.active ? "bg-[#e7f5df] text-[#28633e]" : "bg-[#f2f8fb] text-[#4f8194]"}`}>{row.original.active ? "Active" : "Inactive"}</span> },
	], []);
	const search = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = new FormData(event.currentTarget).get("search");
		updateState({ ...state, page: 1, q: typeof value === "string" ? value : undefined });
	};
	if (offerings.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium">Offerings could not load.</h1><p className="mt-2 text-sm text-muted">{offerings.error.message}</p><Button className="mt-5" onClick={() => void offerings.refetch()} variant="secondary">Retry</Button></section>;
	return <div className="mx-auto max-w-7xl space-y-5">
		<header className="rounded-card bg-ink p-5 text-surface shadow-float sm:flex sm:items-end sm:justify-between sm:p-7"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Sellable configurations</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Offerings make products ready for the shelf.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-surface/70">Set pack details and prices here. Stock changes remain in the inventory ledger.</p></div><Link className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-action px-5 text-sm font-medium text-ink shadow-[0_8px_0_#a5d2e2] sm:mt-0" to="/cms/offerings/new">New offering</Link></header>
		<section className="rounded-card border border-white/70 bg-surface p-5 shadow-float"><form className="flex flex-col gap-3 sm:flex-row" onSubmit={search}><Field defaultValue={state.q} label="Search offerings" name="search" placeholder="Search SKU or pack…" wrapperClassName="flex-1" /><Button className="sm:self-end" type="submit" variant="secondary">Search</Button></form></section>
		<DataTable columns={columns} data={offerings.data?.items ?? []} emptyMessage="No offerings match this view." isLoading={offerings.isPending || offerings.isFetching} onPageChange={(pageIndex) => updateState({ ...state, page: pageIndex + 1 })} onSortingChange={(next) => { const first = next[0]; updateState({ ...state, page: 1, sort: first?.id, direction: first?.desc ? "desc" : "asc" }); }} pageIndex={state.page - 1} pageSize={state.pageSize} rowCount={offerings.data?.totalItems ?? 0} sorting={sorting} />
	</div>;
}
