import { useState, type FormEvent } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

import type { Order, OrderDetail, VerifyDeliveryInput } from "../../../shared/contracts/order";
import { Button } from "../../components/button";
import { formatMoney } from "../../lib/format-money";
import { useActiveDeliveries, useVerifyDelivery } from "./cms-orders-api";

type VerifyMutation = UseMutationResult<OrderDetail, Error, { orderNumber: string; input: VerifyDeliveryInput }>;

function timestamp(value: number) {
	return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function DeliveryOrdersPage() {
	const deliveries = useActiveDeliveries();
	const verify = useVerifyDelivery();
	const active = deliveries.data?.items.filter((order) => order.status === "out_for_delivery") ?? [];
	if (deliveries.isPending) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float">Loading deliveries…</section>;
	if (deliveries.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium tracking-tight">We could not load your deliveries.</h1><p className="mt-2 text-sm text-muted">{deliveries.error.message}</p><Button className="mt-5" onClick={() => void deliveries.refetch()} variant="secondary">Retry</Button></section>;
	if (active.length === 0) return <section className="rounded-card border border-dashed border-line bg-surface p-10 text-center shadow-float"><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Delivery queue</p><h1 className="mt-2 text-2xl font-medium tracking-tight">No deliveries are out for delivery right now.</h1><p className="mt-2 text-sm text-muted">When an order heads out for delivery, it will appear here for verification.</p></section>;
	if (verify.isError) return <section className="grid gap-5"><h1 className="text-xl font-medium tracking-tight">Delivery queue</h1><p aria-live="polite" className="rounded-2xl bg-[#fff5f4] p-3 text-sm text-[#8e301d]">Verification failed. {verify.error instanceof Error ? verify.error.message : "Please try again."}</p><div className="grid gap-3">{active.map((order) => <DeliveryCard key={order.id} order={order} verify={verify} />)}</div></section>;
	return <section className="space-y-4 pb-4"><header><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Delivery queue</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Complete each drop-off to verify.</h1></header><div className="grid gap-3">{active.map((order) => <DeliveryCard key={order.id} order={order} verify={verify} />)}</div></section>;
}

function DeliveryCard({ order, verify }: { order: Order; verify: VerifyMutation }) {
	const [open, setOpen] = useState(false);
	const [pin, setPin] = useState("");
	const [token, setToken] = useState("");
	const [invalidMessage, setInvalidMessage] = useState<string | null>(null);	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmedPin = pin.trim();
		const trimmedToken = token.trim();
		if (trimmedPin && trimmedToken) {
			setInvalidMessage("Provide exactly one of PIN or token.");
			return;
		}
		if (!trimmedPin && !trimmedToken) {
			setInvalidMessage("Enter the customer's six-digit PIN or a verification token.");
			return;
		}
		setInvalidMessage(null);
		verify.mutate({
			orderNumber: order.orderNumber,
			input: trimmedPin ? { pin: trimmedPin } : { token: trimmedToken },
		});
	};

	return <article aria-label={`Delivery for ${order.orderNumber}`} className="rounded-card bg-surface p-5 shadow-float">
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="min-w-0"><h2 className="font-medium tracking-tight">{order.orderNumber}</h2><p className="mt-1 text-sm text-muted">{order.itemCount} {order.itemCount === 1 ? "item" : "items"} · Placed {timestamp(order.placedAt)}</p></div>
			<div className="text-right"><p className="text-lg font-medium">COD {formatMoney(order.totalMinor, order.currency)}</p><p className="mt-1 inline-block rounded-full bg-[#e7f5df] px-3 py-0.5 text-xs font-medium text-[#28633e]">Out for delivery</p></div>
		</div>
		{verify.isError ? <p aria-live="polite" className="mt-3 rounded-2xl bg-[#fff5f4] p-3 text-sm text-[#8e301d]">{verify.error instanceof Error ? verify.error.message : "This delivery could not be verified. Please try again."}</p> : null}
		<div className="mt-4 border-t border-line pt-4">
			{open ? <form className="grid gap-3" onSubmit={submit}><p className="text-sm text-muted">Ask the customer for their fallback PIN, or scan the QR token they show at the door.</p><label className="grid gap-1.5 text-sm font-medium text-ink">Fallback PIN<input aria-label="Delivery PIN" className="min-h-12 min-w-0 rounded-2xl border border-line bg-surface px-4 text-base tracking-[0.3em] font-normal outline-none transition focus:border-action" inputMode="numeric" maxLength={6} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="000000" value={pin} /></label><label className="grid gap-1.5 text-sm font-medium text-ink">QR token<input aria-label="Delivery token" className="min-h-12 min-w-0 rounded-2xl border border-line bg-surface px-4 text-base font-normal outline-none transition focus:border-action" onChange={(event) => setToken(event.target.value)} placeholder="Paste the token" value={token} /></label>{invalidMessage ? <p aria-live="polite" className="text-sm text-[#ae3f27]">{invalidMessage}</p> : null}<div className="flex flex-wrap gap-2"><Button disabled={verify.isPending} type="submit">{verify.isPending ? "Verifying…" : "Confirm delivery"}</Button><Button disabled={verify.isPending} onClick={() => { setOpen(false); setInvalidMessage(null); }} type="button" variant="quiet">Back</Button></div></form> : <Button className="w-full sm:w-auto" onClick={() => setOpen(true)} type="button" variant="secondary">Complete delivery</Button>}
		</div>
	</article>;
}
