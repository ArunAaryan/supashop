import { useMemo, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Link, useSearchParams } from "react-router-dom";

import { cmsOrderListQuerySchema, type CmsOrderListQuery, type Order } from "../../../shared/contracts/order";
import { Button } from "../../components/button";
import { DataTable } from "../../components/data-table";
import { Field } from "../../components/field";
import { formatMoney } from "../../lib/format-money";
import { useCmsOrders } from "./cms-orders-api";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const statusOptions = ["placed", "confirmed", "preparing", "ready", "out_for_delivery", "delivered", "cancelled", "rejected"];

function statusLabel(status: string) {
	return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusPill(status: string) {
	const activeLike = status === "confirmed" || status === "preparing" || status === "ready" || status === "out_for_delivery";
	const classes = activeLike
		? "bg-[#e7f5df] text-[#28633e]"
		: status === "delivered"
			? "bg-[#e7eefe] text-[#2b3b8c]"
			: status === "cancelled" || status === "rejected"
				? "bg-[#fde4de] text-[#8e301d]"
				: "bg-[#f2f8fb] text-[#4f8194]";
	return <span className={`rounded-full px-3 py-1 text-xs font-medium ${classes}`}>{statusLabel(status)}</span>;
}

function queryFromState(state: { page: number; status?: string; search?: string }): CmsOrderListQuery {
	return cmsOrderListQuerySchema.parse({
		page: state.page,
		pageSize: 20,
		...(state.status && state.status !== "all" ? { status: state.status } : {}),
		search: state.search,
	});
}

function readPage(state: string | null) {
	const parsed = Number(state ?? "1");
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function CmsOrdersPage() {
	const [params, setParams] = useSearchParams();
	const state = useMemo(() => ({
		page: readPage(params.get("page")),
		status: params.get("status") ?? "all",
		search: params.get("search") ?? undefined,
	}), [params]);
	const query = useMemo(() => queryFromState(state), [state]);
	const orders = useCmsOrders(query);
	const columns = useMemo<ColumnDef<Order, unknown>[]>(() => [
		{ accessorKey: "orderNumber", header: "Order", cell: ({ row }) => <Link className="font-medium underline-offset-4 hover:underline" to={`/cms/orders/${row.original.orderNumber}`}>{row.original.orderNumber}</Link> },
		{ accessorKey: "placedAt", header: "Placed", cell: ({ row }) => dateFormatter.format(row.original.placedAt) },
		{ accessorKey: "itemCount", header: "Items", cell: ({ row }) => row.original.itemCount },
		{ accessorKey: "totalMinor", header: "Total", cell: ({ row }) => <span className="font-medium">{formatMoney(row.original.totalMinor, row.original.currency)}</span> },
		{ accessorKey: "status", header: "Status", cell: ({ row }) => statusPill(row.original.status) },
		{ accessorKey: "paymentStatus", header: "Payment", cell: ({ row }) => statusLabel(row.original.paymentStatus) },
	], []);
	const update = (next: { page?: number; status?: string; search?: string }) => {
		const merged = { ...state, ...next };
		const paramsBuilder = new URLSearchParams();
		if (merged.search) paramsBuilder.set("search", merged.search);
		paramsBuilder.set("page", String(merged.page));
		if (merged.status && merged.status !== "all") paramsBuilder.set("status", merged.status);
		setParams(paramsBuilder);
	};
	const search = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = new FormData(event.currentTarget).get("search");
		update({ page: 1, search: typeof value === "string" ? value : undefined });
	};
	const changeStatus = (value: string) => update({ page: 1, status: value });

	if (orders.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium">Orders could not load.</h1><p className="mt-2 text-sm text-muted">{orders.error.message}</p><Button className="mt-5" onClick={() => void orders.refetch()} variant="secondary">Retry</Button></section>;

	return <div className="mx-auto max-w-7xl space-y-5">
		<header className="rounded-card bg-ink p-5 text-surface shadow-float sm:flex sm:items-end sm:justify-between sm:p-7"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Operations desk</p><h1 className="mt-2 text-3xl font-medium tracking-tight">From placement to doorstep.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-surface/70">Acknowledge, prepare, and hand orders over for delivery with clear status at every step.</p></div></header>
		<section className="rounded-card border border-white/70 bg-surface p-5 shadow-float"><form className="flex flex-col gap-3 sm:flex-row" onSubmit={search}><Field defaultValue={state.search} label="Search orders" name="search" placeholder="Search order number…" wrapperClassName="flex-1" /><Button className="sm:self-end" type="submit" variant="secondary">Search</Button></form><label className="mt-4 grid gap-1.5 text-sm font-medium text-ink">Status<select aria-label="Status" className="min-h-12 w-full min-w-0 rounded-2xl border border-line bg-surface px-4 text-base font-normal outline-none transition focus:border-action sm:max-w-xs" onChange={(event) => changeStatus(event.target.value)} value={state.status}><option value="all">All</option>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label></section>
		<DataTable columns={columns} data={orders.data?.items ?? []} emptyMessage="No orders match this view." isLoading={orders.isPending || orders.isFetching} onPageChange={(pageIndex) => update({ page: pageIndex + 1 })} onSortingChange={() => undefined} pageIndex={state.page - 1} pageSize={20} rowCount={orders.data?.totalItems ?? 0} sorting={[]} />
	</div>;
}
