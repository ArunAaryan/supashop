import { Link } from "react-router-dom";

import type { CartLine } from "../../../shared/contracts/cart";
import { Button } from "../../components/button";
import { formatMoney } from "../../lib/format-money";
import { useCart, useRemoveCartItem, useSetCartItem } from "./cart-api";

function CartLoading() {
	return <div aria-busy="true" aria-label="Loading cart…" className="grid gap-4"><div className="h-32 animate-pulse rounded-card bg-surface shadow-float motion-reduce:animate-none" /><div className="h-32 animate-pulse rounded-card bg-surface shadow-float motion-reduce:animate-none" /></div>;
}

function CartError({ onRetry }: { onRetry: () => void }) {
	return <section className="rounded-card border border-line bg-surface p-6 text-center shadow-float"><h1 className="text-2xl font-medium tracking-tight">We could not load your cart.</h1><p className="mt-2 text-sm text-muted">Your items are safe. Please try again.</p><Button className="mt-5" onClick={onRetry} variant="secondary">Retry</Button></section>;
}

function warningFor(line: CartLine) {
	if (line.availability === "out_of_stock") return "This pack is out of stock.";
	if (line.availability === "insufficient_stock") return `Only ${line.availableStock} available right now.`;
	if (line.availability === "unavailable") return "This pack is no longer available.";
	return null;
}

function mutationMessage(error: unknown) {
	if (error instanceof Error && error.message) return error.message;
	return "Please refresh the cart and try again.";
}

function CartLineItem({ line }: { line: CartLine }) {
	const setItem = useSetCartItem();
	const removeItem = useRemoveCartItem();
	const pending = setItem.isPending || removeItem.isPending;
	const warning = warningFor(line);
	const cannotIncrease = line.quantity >= 99 || line.availability !== "available" || line.quantity >= line.availableStock;
	const mutationError = setItem.error ?? removeItem.error;
	const updateQuantity = (quantity: number) => {
		if (quantity < 1) removeItem.mutate(line.offeringId);
		else setItem.mutate({ offeringId: line.offeringId, input: { quantity } });
	};
	return <article className="grid min-w-0 gap-4 rounded-card bg-surface p-4 shadow-float sm:grid-cols-[7rem_1fr_auto] sm:p-5">
		<Link aria-label={`View ${line.productName}`} className="grid aspect-square w-24 place-items-center overflow-hidden rounded-2xl bg-[#f7fbfd] text-center text-xs text-muted sm:w-28" to={`/products/${line.productSlug}`}>{line.imageUrl ? <img alt="" className="size-full object-cover" src={line.imageUrl} /> : "No image yet"}</Link>
		<div className="min-w-0"><Link className="text-lg font-medium tracking-tight underline-offset-4 hover:underline" to={`/products/${line.productSlug}`}>{line.productName}</Link><p className="mt-1 text-sm text-muted">{line.offeringLabel}</p><p className="mt-3 text-base font-medium">{formatMoney(line.currentUnitPriceMinor)}{line.priceChanged ? <span className="ml-2 text-sm font-normal text-muted line-through">{formatMoney(line.unitPriceMinorAtAdd)}</span> : null}</p>{line.priceChanged ? <p className="mt-2 rounded-xl bg-action px-3 py-2 text-xs font-medium">Price changed since you added this item.</p> : null}{warning ? <p className="mt-2 rounded-xl bg-[#f2f8fb] px-3 py-2 text-xs font-medium text-focus">{warning}</p> : null}</div>
		<div className="flex min-w-0 flex-row items-end justify-between gap-3 sm:flex-col sm:items-end"><div className="inline-flex min-h-11 items-center rounded-full border border-line bg-[#f7fbfd] p-1"><button aria-label={`Remove one ${line.productName}`} className="grid size-9 place-items-center rounded-full text-lg font-medium hover:bg-surface disabled:opacity-50" disabled={pending} onClick={() => updateQuantity(line.quantity - 1)} type="button">−</button><span aria-label={`${line.productName} quantity`} className="min-w-8 text-center text-sm font-medium">{line.quantity}</span><button aria-label={`Add one ${line.productName}`} className="grid size-9 place-items-center rounded-full text-lg font-medium hover:bg-surface disabled:opacity-50" disabled={pending || cannotIncrease} onClick={() => updateQuantity(line.quantity + 1)} type="button">+</button></div><div className="text-right"><p className="text-base font-medium">{formatMoney(line.lineTotalMinor)}</p><button className="mt-2 text-sm font-medium text-focus underline-offset-4 hover:underline disabled:opacity-50" disabled={pending} onClick={() => removeItem.mutate(line.offeringId)} type="button">Remove {line.productName}</button></div></div>
		{mutationError ? <p aria-live="polite" className="sm:col-span-3 rounded-xl bg-[#f2f8fb] px-3 py-2 text-sm font-medium text-focus">We could not update {line.productName}. {mutationMessage(mutationError)}</p> : null}
	</article>;
}

export function CartPage() {
	const cart = useCart();
	if (cart.isPending) return <CartLoading />;
	if (cart.isError) return <CartError onRetry={() => void cart.refetch()} />;
	if (!cart.data || cart.data.lines.length === 0) return <section className="rounded-card border border-dashed border-line bg-surface p-8 text-center shadow-float"><h1 className="text-2xl font-medium tracking-tight">Your cart is empty.</h1><p className="mt-2 text-sm text-muted">Find a few everyday essentials and add them here.</p><Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-action px-5 text-sm font-medium text-ink shadow-[0_8px_0_#a5d2e2]" to="/shop">Browse the shop</Link></section>;
	return <div className="grid min-w-0 gap-5 pb-4 lg:grid-cols-[1fr_22rem]">
		<section className="min-w-0"><header className="mb-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-focus">Your selections</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Your cart</h1><p className="mt-1 text-sm text-muted">{cart.data.itemCount} {cart.data.itemCount === 1 ? "item" : "items"}</p></header>{cart.data.requiresReview ? <p className="mb-4 rounded-2xl bg-action p-4 text-sm font-medium">Review changes before checkout: prices or availability have changed.</p> : null}<div className="grid gap-4">{cart.data.lines.map((line) => <CartLineItem key={line.offeringId} line={line} />)}</div></section>
		<aside className="h-fit rounded-card bg-ink p-5 text-surface shadow-float"><h2 className="text-xl font-medium tracking-tight">Order summary</h2><div className="mt-5 flex items-center justify-between border-t border-surface/20 pt-4 text-lg font-medium"><span>Subtotal</span><span>{formatMoney(cart.data.subtotalMinor)}</span></div>{cart.data.lines.some((line) => line.availability !== "available") ? <p className="mt-4 rounded-2xl bg-surface/10 p-3 text-sm leading-6 text-surface/80">Update unavailable cart lines before checkout.</p> : <><p className="mt-4 rounded-2xl bg-surface/10 p-3 text-sm leading-6 text-surface/80">Current prices will be confirmed before the order is placed.</p><Link className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-action px-5 text-sm font-medium text-ink shadow-[0_8px_0_#a5d2e2]" to="/checkout">Checkout · COD</Link></>}</aside>
	</div>;
}
