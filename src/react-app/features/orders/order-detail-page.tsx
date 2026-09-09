import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../../components/button";
import { formatMoney } from "../../lib/format-money";
import { cartKeys } from "../cart/cart-api";
import { QrCode } from "./qr-code";
import { useCancelOrder, useOrder, useReorder } from "./orders-api";
import { useQueryClient } from "@tanstack/react-query";

function timestamp(value: number | null) {
	return value === null ? "Not confirmed yet" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: string) {
	return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Please try again.";
}

export function OrderDetailPage({ orderNumber }: { orderNumber: string }) {
	const order = useOrder(orderNumber);
	const cancel = useCancelOrder();
	const reorder = useReorder();
	const queryClient = useQueryClient();
	const [showCancellation, setShowCancellation] = useState(false);
	const [reason, setReason] = useState("");
	const [reorderNotice, setReorderNotice] = useState<string | null>(null);
	if (order.isPending) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float">Loading your order…</section>;
	if (order.isError || !order.data) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium tracking-tight">We could not load this order.</h1><p className="mt-2 text-sm text-muted">It may no longer be available in this browser session.</p><Button className="mt-5" onClick={() => void order.refetch()} variant="secondary">Retry</Button></section>;
	const data = order.data;
	const unavailable = reorder.data?.lines.filter((line) => line.status !== "added").length ?? 0;
	const startReorder = async () => {
		setReorderNotice(null);
		try {
			const result = await reorder.mutateAsync(data.orderNumber);
			await queryClient.invalidateQueries({ queryKey: cartKeys.cart });
			const skipped = result.lines.filter((line) => line.status !== "added").length;
			setReorderNotice(skipped ? `${skipped} ${skipped === 1 ? "item could" : "items could"} not be added because availability changed.` : "Available items were added to your cart.");
		} catch { /* mutation error renders below */ }
	};
	const submitCancellation = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		try {
			await cancel.mutateAsync({ orderNumber: data.orderNumber, input: { reason } });
			setShowCancellation(false);
		} catch { /* mutation error renders below */ }
	};
	return <article className="grid gap-5 pb-4 lg:grid-cols-[1fr_22rem]"><section className="min-w-0 space-y-5"><header className="rounded-card bg-ink p-5 text-surface shadow-float"><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Order tracking</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-medium tracking-tight">{data.orderNumber}</h1><span className="rounded-full bg-surface/15 px-3 py-1 text-xs font-medium">{statusLabel(data.status)}</span></div><p className="mt-3 text-sm text-surface/75">Placed {timestamp(data.placedAt)}</p>{data.expectedDeliveryAt !== null ? <p className="mt-2 text-sm font-medium">Expected delivery: {timestamp(data.expectedDeliveryAt)}</p> : null}</header>
		<section className="rounded-card bg-surface p-5 shadow-float"><h2 className="text-xl font-medium tracking-tight">Items</h2><div className="mt-4 grid gap-3">{data.items.map((item) => <div className="flex items-start justify-between gap-3 border-t border-line pt-3" key={item.offeringId}><div><p className="font-medium">{item.productName}</p><p className="text-sm text-muted">{item.offeringLabel} · Quantity {item.quantity}</p></div><p className="shrink-0 font-medium">{formatMoney(item.lineTotalMinor, data.currency)}</p></div>)}</div><div className="mt-5 space-y-2 border-t border-line pt-4 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{formatMoney(data.subtotalMinor, data.currency)}</span></p><p className="flex justify-between"><span>Delivery</span><span>{formatMoney(data.deliveryFeeMinor, data.currency)}</span></p><p className="flex justify-between text-base font-medium"><span>Total (COD)</span><span>{formatMoney(data.totalMinor, data.currency)}</span></p></div></section>
		<section className="rounded-card bg-surface p-5 shadow-float"><h2 className="text-xl font-medium tracking-tight">Delivery address</h2><address className="mt-3 not-italic text-sm leading-6 text-muted"><strong className="font-medium text-ink">{data.address.recipientName}</strong><br />{data.address.addressLine1}{data.address.addressLine2 ? <><br />{data.address.addressLine2}</> : null}{data.address.landmark ? <><br />Near {data.address.landmark}</> : null}<br />{data.address.city}, {data.address.state} {data.address.postalCode}<br />{data.address.mobile}{data.address.deliveryInstructions ? <><br /><span className="font-medium text-ink">Instructions:</span> {data.address.deliveryInstructions}</> : null}</address></section>
		<section className="rounded-card bg-surface p-5 shadow-float"><h2 className="text-xl font-medium tracking-tight">Order updates</h2><ol className="mt-4 grid gap-4 border-l-2 border-action pl-4">{data.statusHistory.map((entry) => <li key={entry.id}><p className="font-medium">{statusLabel(entry.toStatus)}</p><p className="text-sm text-muted">{timestamp(entry.createdAt)}{entry.reason ? ` · ${entry.reason}` : ""}</p></li>)}</ol></section></section>
		<aside className="h-fit space-y-4 rounded-card bg-surface p-5 shadow-float">{data.deliveryProof ? <section className="rounded-2xl bg-[#f7fbfd] p-4 text-center"><h2 className="text-lg font-medium tracking-tight">Delivery code</h2><p className="mt-1 text-sm text-muted">Show this to the delivery partner to receive your order.</p><div className="mt-3 flex justify-center"><QrCode alt="Delivery verification QR code" value={data.deliveryProof.qrToken} /></div><p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-muted">Fallback PIN</p><p aria-label={`Delivery PIN ${data.deliveryProof.pin}`} className="mt-1 text-2xl font-medium tracking-[0.35em]">{data.deliveryProof.pin}</p></section> : null}<h2 className="text-xl font-medium tracking-tight">Need to change this order?</h2><p className="text-sm leading-6 text-muted">Cash on delivery · Payment {statusLabel(data.paymentStatus)}</p>{data.customerCanCancel ? <Button className="w-full" onClick={() => setShowCancellation(true)} type="button" variant="secondary">Cancel order</Button> : <p className="rounded-2xl bg-[#f7fbfd] p-3 text-sm text-muted">This order can no longer be cancelled from the customer app.</p>}<Button className="w-full" disabled={reorder.isPending} onClick={() => void startReorder()} type="button">{reorder.isPending ? "Adding available items…" : "Reorder available items"}</Button>{reorderNotice ? <p aria-live="polite" className="rounded-2xl bg-action/40 p-3 text-sm font-medium">{reorderNotice} <Link className="underline" to="/cart">View cart</Link></p> : null}{reorder.isError ? <p aria-live="polite" className="rounded-2xl bg-[#fff5f4] p-3 text-sm text-[#8e301d]">We could not reorder this order. {errorMessage(reorder.error)}</p> : null}{unavailable > 0 ? null : null}</aside>
		{showCancellation ? <div aria-modal="true" className="fixed inset-0 z-20 grid place-items-center bg-ink/45 p-4" role="dialog" aria-labelledby="cancel-order-title"><form className="w-full max-w-md rounded-card bg-surface p-6 shadow-float" onSubmit={submitCancellation}><h2 className="text-xl font-medium tracking-tight" id="cancel-order-title">Cancel order?</h2><p className="mt-2 text-sm text-muted">This cannot be undone. Tell the store why you need to cancel.</p><label className="mt-4 grid gap-1.5 text-sm font-medium">Cancellation reason<textarea aria-label="Cancellation reason" autoFocus className="min-h-24 rounded-2xl border border-line bg-surface px-3 py-2" maxLength={500} onChange={(event) => setReason(event.target.value)} required value={reason} /></label>{cancel.isError ? <p aria-live="polite" className="mt-3 text-sm text-[#8e301d]">We could not cancel this order. {errorMessage(cancel.error)}</p> : null}<div className="mt-5 flex justify-end gap-3"><Button disabled={cancel.isPending} onClick={() => setShowCancellation(false)} type="button" variant="quiet">Keep order</Button><Button disabled={cancel.isPending || !reason.trim()} type="submit">{cancel.isPending ? "Cancelling…" : "Confirm cancellation"}</Button></div></form></div> : null}</article>;
}
