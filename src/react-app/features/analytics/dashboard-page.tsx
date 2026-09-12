import { Link } from "react-router-dom";

import { Button } from "../../components/button";
import { formatMoney } from "../../lib/format-money";
import { useAnalyticsOverview } from "./analytics-api";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return <div className="rounded-card bg-surface p-5 shadow-float">
		<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
		<p className="mt-2 text-3xl font-medium tracking-tight">{value}</p>
		{hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
	</div>;
}

function statusLabel(status: string) {
	return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

export function DashboardPage() {
	const analytics = useAnalyticsOverview();
	if (analytics.isPending) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float">Loading dashboard…</section>;
	if (analytics.isError || !analytics.data) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium tracking-tight">The dashboard could not load.</h1><p className="mt-2 text-sm text-muted">{analytics.error?.message ?? "Please try again."}</p><Button className="mt-5" onClick={() => void analytics.refetch()} variant="secondary">Retry</Button></section>;

	const { overview, topOfferings, lowStock, queue } = analytics.data;

	return <div className="mx-auto max-w-7xl space-y-5">
		<header className="rounded-card bg-ink p-5 text-surface shadow-float sm:p-7">
			<p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Operations desk</p>
			<h1 className="mt-2 text-3xl font-medium tracking-tight">Your store at a glance.</h1>
			<p className="mt-2 max-w-2xl text-sm leading-6 text-surface/70">Today's orders, delivered revenue, and the items that need attention.</p>
		</header>
		<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<StatCard label="Orders today" value={String(overview.ordersToday)} />
			<StatCard label="Orders this week" value={String(overview.ordersThisWeek)} hint="last 7 days" />
			<StatCard label="Delivered revenue" value={formatMoney(overview.deliveredRevenueMinor)} hint="COD collected" />
			<StatCard label="Units sold" value={String(overview.unitsSold)} hint="delivered items" />
			<StatCard label="Average order value" value={formatMoney(overview.averageOrderValueMinor)} />
			<StatCard label="Cancellation rate" value={`${(overview.cancellationRateBasisPoints / 100).toFixed(1)}%`} hint={`${overview.cancellationCount} cancelled`} />
		</section>
		<section className="grid gap-5 lg:grid-cols-2">
			<div className="rounded-card bg-surface p-5 shadow-float">
				<h2 className="text-xl font-medium tracking-tight">Top offerings</h2>
				{topOfferings.length === 0 ? <p className="mt-4 text-sm text-muted">No delivered orders yet.</p> : <ol className="mt-4 grid gap-3">{topOfferings.map((item) => <li className="flex items-center justify-between gap-3 border-t border-line pt-3" key={item.offeringId}><span className="font-medium">{item.productName} · {item.offeringLabel}</span><span className="shrink-0 text-sm font-medium">{item.unitsSold} units</span></li>)}</ol>}
			</div>
			<div className="rounded-card bg-surface p-5 shadow-float">
				<h2 className="text-xl font-medium tracking-tight">Low stock</h2>
				{lowStock.length === 0 ? <p className="mt-4 text-sm text-muted">No offerings are running low.</p> : <ul className="mt-4 grid gap-3">{lowStock.map((item) => <li className="flex items-center justify-between gap-3 border-t border-line pt-3" key={item.offeringId}><span className="font-medium">{item.productName} · {item.offeringLabel}</span><span className="shrink-0 text-sm font-medium text-[#8e301d]">{item.stockQuantity} left</span></li>)}</ul>}
			</div>
		</section>
		<section className="rounded-card bg-surface p-5 shadow-float">
			<h2 className="text-xl font-medium tracking-tight">Live order queue</h2>
			{queue.length === 0 ? <p className="mt-4 text-sm text-muted">No open orders awaiting acknowledgement.</p> : <div className="mt-4 grid gap-3">{queue.map((order) => <Link className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3" key={order.id} to={`/cms/orders/${order.orderNumber}`}><span className="font-medium underline-offset-4 hover:underline">{order.orderNumber}</span><span className="text-sm text-muted">Placed {dateFormatter.format(order.placedAt)} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}</span><span className="rounded-full bg-[#f7fbfd] px-3 py-1 text-xs font-medium">{statusLabel(order.status)}</span></Link>)}</div>}
		</section>
	</div>;
}
