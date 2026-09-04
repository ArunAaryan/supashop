import { Link, useSearchParams } from "react-router-dom";

import { formatMoney } from "../../lib/format-money";
import { Button } from "../../components/button";
import { useOrders } from "./orders-api";

function timestamp(value: number) {
	return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: string) {
	return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function OrdersPage() {
	const [params, setParams] = useSearchParams();
	const requestedPage = Number(params.get("page") ?? "1");
	const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const orders = useOrders({ page, pageSize: 20 });
	if (orders.isPending) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float">Loading your orders…</section>;
	if (orders.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium tracking-tight">We could not load your orders.</h1><p className="mt-2 text-sm text-muted">Please try again.</p><Button className="mt-5" onClick={() => void orders.refetch()} variant="secondary">Retry</Button></section>;
	const data = orders.data;
	if (!data || data.items.length === 0) return <section className="rounded-card border border-dashed border-line bg-surface p-8 text-center shadow-float"><h1 className="text-2xl font-medium tracking-tight">No orders yet.</h1><p className="mt-2 text-sm text-muted">When you place an order, its delivery progress will appear here.</p><Link className="mt-5 inline-flex min-h-11 items-center rounded-full bg-action px-5 text-sm font-medium text-ink" to="/shop">Browse the shop</Link></section>;
	return <section className="space-y-4 pb-4"><header><p className="text-xs font-medium uppercase tracking-[0.16em] text-focus">Delivery history</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Your orders</h1></header><div className="grid gap-3">{data.items.map((order) => <Link className="rounded-card bg-surface p-5 shadow-float transition hover:-translate-y-0.5 motion-reduce:transition-none" key={order.id} to={`/orders/${order.orderNumber}`}><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-medium tracking-tight">{order.orderNumber}</span><span className="rounded-full bg-[#f7fbfd] px-3 py-1 text-xs font-medium">{statusLabel(order.status)}</span></div><p className="mt-3 text-sm text-muted">Placed {timestamp(order.placedAt)} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}</p><p className="mt-3 text-lg font-medium">COD {formatMoney(order.totalMinor, order.currency)}</p></Link>)}</div>{data.totalPages > 1 ? <nav aria-label="Order history pages" className="flex items-center justify-between"><Button disabled={data.page <= 1} onClick={() => setParams({ page: String(data.page - 1) })} type="button" variant="secondary">Previous</Button><p className="text-sm text-muted">Page {data.page} of {data.totalPages}</p><Button disabled={data.page >= data.totalPages} onClick={() => setParams({ page: String(data.page + 1) })} type="button" variant="secondary">Next</Button></nav> : null}</section>;
}
