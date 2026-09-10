import { useState, type FormEvent } from "react";

import { canTransitionOrder, type OrderStatus } from "../../../shared/domain/order";
import type { OrderTransitionInput } from "../../../shared/contracts/order";
import { Button } from "../../components/button";
import { formatMoney } from "../../lib/format-money";
import { useCmsOrder, useTransitionOrder } from "./cms-orders-api";

const advanceByStatus: Partial<Record<OrderStatus, OrderStatus>> = {
	confirmed: "preparing",
	preparing: "ready",
	ready: "out_for_delivery",
};

function timestamp(value: number | null) {
	return value === null ? "Not set yet" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

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

function transitionErrorLabel(error: unknown) {
	if (error instanceof Error && "status" in error && (error as { status?: number }).status === 409) {
		return "Order changed; reload and retry";
	}
	return error instanceof Error ? error.message : "The transition could not be completed. Please try again.";
}

export function CmsOrderDetail({ orderNumber }: { orderNumber: string }) {
	const order = useCmsOrder(orderNumber);
	const transition = useTransitionOrder();
	const [eta, setEta] = useState("");
	const [cancelReason, setCancelReason] = useState("");
	const [rejectReason, setRejectReason] = useState("");

	if (order.isPending) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float">Loading order…</section>;
	if (order.isError || !order.data) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium tracking-tight">We could not load this order.</h1><p className="mt-2 text-sm text-muted">It may no longer be visible to the operations desk.</p><Button className="mt-5" onClick={() => void order.refetch()} variant="secondary">Retry</Button></section>;

	const data = order.data;
	const next = advanceByStatus[data.status];
	const { isPending } = transition;

	const runTransition = ({ orderNumber, input }: { orderNumber: string; input: OrderTransitionInput }) => {
		transition.mutate({ orderNumber, input });
	};

	const acknowledge = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!eta) return;
		const expectedDeliveryAt = new Date(eta).getTime();
		if (Number.isNaN(expectedDeliveryAt)) return;
		runTransition({ orderNumber: data.orderNumber, input: { toStatus: "confirmed", expectedDeliveryAt } });
	};
	const advance = () => {
		if (!next) return;
		runTransition({ orderNumber: data.orderNumber, input: { toStatus: next } });
	};
	const cancel = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!cancelReason.trim()) return;
		runTransition({ orderNumber: data.orderNumber, input: { toStatus: "cancelled", reason: cancelReason.trim() } });
	};
	const reject = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!rejectReason.trim()) return;
		runTransition({ orderNumber: data.orderNumber, input: { toStatus: "rejected", reason: rejectReason.trim() } });
	};

	const showAdvance = next !== undefined;
	const showAcknowledge = data.status === "placed";
	const showCancel = canTransitionOrder(data.status, "cancelled", "cms");
	const showReject = canTransitionOrder(data.status, "rejected", "cms");
	const actionsAvailable = showAdvance || showAcknowledge || showCancel || showReject;

	return <article className="grid gap-5 pb-4 lg:grid-cols-[1fr_22rem]">
		<section className="min-w-0 space-y-5">
			<header className="rounded-card bg-ink p-5 text-surface shadow-float">
				<p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Order operations</p>
				<div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-medium tracking-tight">{data.orderNumber}</h1>{statusPill(data.status)}</div>
				<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><p className="text-surface/75">Placed {timestamp(data.placedAt)}</p><p className="font-medium">Expected delivery: {timestamp(data.expectedDeliveryAt)}</p><p>Payment {statusLabel(data.paymentStatus)}</p></div>
			</header>
			<section className="rounded-card bg-surface p-5 shadow-float">
				<h2 className="text-xl font-medium tracking-tight">Items</h2>
				<div className="mt-4 grid gap-3">{data.items.map((item) => <div className="flex items-start justify-between gap-3 border-t border-line pt-3" key={item.offeringId}><div><p className="font-medium">{item.productName}</p><p className="text-sm text-muted">{item.offeringLabel} · Quantity {item.quantity}</p></div><p className="shrink-0 font-medium">{formatMoney(item.lineTotalMinor, data.currency)}</p></div>)}</div>
				<div className="mt-5 space-y-2 border-t border-line pt-4 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{formatMoney(data.subtotalMinor, data.currency)}</span></p><p className="flex justify-between"><span>Delivery</span><span>{formatMoney(data.deliveryFeeMinor, data.currency)}</span></p><p className="flex justify-between text-base font-medium"><span>Total (COD)</span><span>{formatMoney(data.totalMinor, data.currency)}</span></p></div>
			</section>
			<section className="rounded-card bg-surface p-5 shadow-float"><h2 className="text-xl font-medium tracking-tight">Delivery address</h2><address className="mt-3 not-italic text-sm leading-6 text-muted"><strong className="font-medium text-ink">{data.address.recipientName}</strong><br />{data.address.addressLine1}{data.address.addressLine2 ? <><br />{data.address.addressLine2}</> : null}{data.address.landmark ? <><br />Near {data.address.landmark}</> : null}<br />{data.address.city}, {data.address.state} {data.address.postalCode}<br />{data.address.mobile}{data.address.deliveryInstructions ? <><br /><span className="font-medium text-ink">Instructions:</span> {data.address.deliveryInstructions}</> : null}</address></section>
			<section className="rounded-card bg-surface p-5 shadow-float"><h2 className="text-xl font-medium tracking-tight">Status history</h2><ol className="mt-4 grid gap-4 border-l-2 border-action pl-4">{data.statusHistory.map((entry) => <li key={entry.id}><p className="font-medium">{statusLabel(entry.toStatus)}</p><p className="text-sm text-muted">{timestamp(entry.createdAt)}{entry.reason ? ` · ${entry.reason}` : ""}</p></li>)}</ol></section>
		</section>
		<aside className="h-fit space-y-4 rounded-card bg-surface p-5 shadow-float">
			<h2 className="text-xl font-medium tracking-tight">Actions</h2>
			{transition.isError ? <p aria-live="polite" className="rounded-2xl bg-[#fff5f4] p-3 text-sm text-[#8e301d]">{transitionErrorLabel(transition.error)}</p> : null}
			{actionsAvailable ? (
				<div className="grid gap-4">
					{showAcknowledge ? <form className="grid gap-3 rounded-2xl bg-[#f7fbfd] p-4" onSubmit={acknowledge}><p className="text-sm font-medium">Acknowledge this order</p><label className="grid gap-1.5 text-xs font-medium text-muted">Expected delivery<input aria-label="Expected delivery" className="min-h-11 rounded-2xl border border-line bg-surface px-4 text-sm text-ink" onChange={(event) => setEta(event.target.value)} required type="datetime-local" value={eta} /></label><Button className="w-full" disabled={isPending || eta === "" || Number.isNaN(new Date(eta).getTime())} type="submit">{isPending ? "Updating…" : "Acknowledge"}</Button></form> : null}
					{showAdvance ? <div className="grid gap-2 rounded-2xl bg-[#f7fbfd] p-4"><p className="text-sm text-muted">Build of the order continues along the fulfilment pipeline.</p><Button className="w-full" disabled={isPending} onClick={advance} type="button">{isPending ? "Updating…" : "Advance"}</Button></div> : null}
					{showCancel ? <form className="grid gap-3 rounded-2xl bg-[#f7fbfd] p-4" onSubmit={cancel}><p className="text-sm font-medium">Cancel this order</p><textarea aria-label="Cancellation reason" className="min-h-20 rounded-2xl border border-line bg-surface px-3 py-2 text-sm" maxLength={500} onChange={(event) => setCancelReason(event.target.value)} placeholder="Reason for cancellation" value={cancelReason} /><Button className="w-full" disabled={isPending || !cancelReason.trim()} type="submit">{isPending ? "Updating…" : "Cancel order"}</Button></form> : null}
					{showReject ? <form className="grid gap-3 rounded-2xl bg-[#f7fbfd] p-4" onSubmit={reject}><p className="text-sm font-medium">Reject this order</p><textarea aria-label="Rejection reason" className="min-h-20 rounded-2xl border border-line bg-surface px-3 py-2 text-sm" maxLength={500} onChange={(event) => setRejectReason(event.target.value)} placeholder="Reason for rejection" value={rejectReason} /><Button className="w-full" disabled={isPending || !rejectReason.trim()} type="submit">{isPending ? "Updating…" : "Reject order"}</Button></form> : null}
				</div>
			) : <p className="rounded-2xl bg-[#f7fbfd] p-3 text-sm text-muted">There are no transition actions available for this order.</p>}
		</aside>
	</article>;
}
