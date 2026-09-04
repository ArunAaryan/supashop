import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { checkoutInputSchema, type DeliveryAddressInput } from "../../../shared/contracts/order";
import type { CartResponse } from "../../../shared/contracts/cart";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { ApiClientError } from "../../lib/api-client";
import { formatMoney } from "../../lib/format-money";
import { useSession } from "../../app/session-client";
import { useCart } from "../cart/cart-api";
import { useCustomerAddresses } from "../orders/orders-api";
import { usePlaceOrder } from "./checkout-api";

const blankAddress: DeliveryAddressInput = {
	recipientName: "", mobile: "", addressLine1: "", addressLine2: null, landmark: null,
	city: "", state: "", postalCode: "", latitude: null, longitude: null, deliveryInstructions: null,
};

function idempotencyKey() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fieldErrors(error: unknown) {
	if (error instanceof ApiClientError && Array.isArray(error.details?.issues)) {
		return Object.fromEntries(error.details.issues.flatMap((issue) => {
			if (!issue || typeof issue !== "object") return [];
			const value = issue as { path?: unknown; message?: unknown };
			return typeof value.path === "string" && typeof value.message === "string" ? [[value.path, value.message]] : [];
		}));
	}
	return {} as Record<string, string>;
}

function addressFromCart(cart: CartResponse, address: DeliveryAddressInput, saveAddress: boolean) {
	return checkoutInputSchema.safeParse({
		deliveryAddress: address,
		expectedLines: cart.lines.map((line) => ({ offeringId: line.offeringId, quantity: line.quantity, expectedUnitPriceMinor: line.currentUnitPriceMinor, offeringVersion: line.offeringVersion })),
		cartUpdatedAt: cart.updatedAt,
		saveAddress,
	});
}

function addressFromSaved(value: { recipientName: string; mobile: string; addressLine1: string; addressLine2: string | null; landmark: string | null; city: string; state: string; postalCode: string; latitude: number | null; longitude: number | null; deliveryInstructions: string | null }): DeliveryAddressInput {
	return {
		recipientName: value.recipientName, mobile: value.mobile, addressLine1: value.addressLine1, addressLine2: value.addressLine2,
		landmark: value.landmark, city: value.city, state: value.state, postalCode: value.postalCode,
		latitude: value.latitude, longitude: value.longitude, deliveryInstructions: value.deliveryInstructions,
	};
}

function hasUnavailableLines(cart: CartResponse) {
	return cart.lines.some((line) => line.availability !== "available");
}

export function CheckoutPage() {
	const navigate = useNavigate();
	const cart = useCart();
	const session = useSession();
	const addresses = useCustomerAddresses(Boolean(session.data?.user));
	const placeOrder = usePlaceOrder();
	const key = useRef(idempotencyKey());
	const [address, setAddress] = useState<DeliveryAddressInput>(blankAddress);
	const [saveAddress, setSaveAddress] = useState(false);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [notice, setNotice] = useState<string | null>(null);
	const update = <K extends keyof DeliveryAddressInput>(name: K, value: DeliveryAddressInput[K]) => {
		setAddress((current) => ({ ...current, [name]: value }));
		setErrors((current) => { const next = { ...current }; delete next[name]; return next; });
		setNotice(null);
	};
	const chooseAddress = (saved: Parameters<typeof addressFromSaved>[0]) => {
		setAddress(addressFromSaved(saved));
		setErrors({});
	};
	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!cart.data) return;
		const parsed = addressFromCart(cart.data, address, Boolean(session.data?.user && saveAddress));
		if (!parsed.success) {
			const next: Record<string, string> = {};
			for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
			setErrors(next);
			setNotice("Please correct the highlighted delivery details.");
			return;
		}
		setErrors({});
		setNotice(null);
		try {
			const order = await placeOrder.mutateAsync({ input: parsed.data, idempotencyKey: key.current });
			navigate(`/orders/${order.orderNumber}`, { replace: true });
		} catch (error) {
			setErrors(fieldErrors(error));
			if (error instanceof ApiClientError && error.status === 409) {
				await cart.refetch();
				key.current = idempotencyKey();
				setNotice("Your cart changed while we checked it. Review the current prices and availability, then try again.");
			} else setNotice(error instanceof Error ? error.message : "We could not place your order. Please try again.");
		}
	};
	if (cart.isPending) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float">Loading checkout…</section>;
	if (cart.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium tracking-tight">We could not load checkout.</h1><Button className="mt-5" onClick={() => void cart.refetch()} variant="secondary">Retry</Button></section>;
	if (!cart.data || cart.data.lines.length === 0) return <section className="rounded-card bg-surface p-8 text-center shadow-float"><h1 className="text-2xl font-medium tracking-tight">Your cart is empty.</h1><Link className="mt-5 inline-flex min-h-11 items-center rounded-full bg-action px-5 text-sm font-medium" to="/shop">Browse the shop</Link></section>;
	if (hasUnavailableLines(cart.data)) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium tracking-tight">Review your cart before checkout.</h1><p className="mt-2 text-sm leading-6 text-muted">One or more packs are unavailable or no longer have enough stock. Update the affected lines before placing an order.</p><Link className="mt-5 inline-flex min-h-11 items-center rounded-full bg-action px-5 text-sm font-medium" to="/cart">Review cart</Link></section>;
	return <form className="grid gap-5 pb-6 lg:grid-cols-[1fr_22rem]" noValidate onSubmit={submit}><section className="space-y-5"><header><p className="text-xs font-medium uppercase tracking-[0.16em] text-focus">Cash on delivery</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Delivery details</h1><p className="mt-2 text-sm text-muted">We will confirm these details with the store before placing your order.</p></header>
		{session.data?.user ? <section className="rounded-card bg-surface p-5 shadow-float"><h2 className="text-lg font-medium">Saved addresses</h2>{addresses.isPending ? <p className="mt-3 text-sm text-muted">Loading saved addresses…</p> : addresses.isError ? <p className="mt-3 text-sm text-[#8e301d]">Saved addresses could not load. You can still enter delivery details below.</p> : addresses.data?.length ? <div className="mt-3 grid gap-2">{addresses.data.map((saved) => <button className="rounded-2xl border border-line p-3 text-left text-sm hover:bg-[#f7fbfd]" key={saved.id} onClick={() => chooseAddress(saved)} type="button"><strong>{saved.label ?? saved.recipientName}</strong><span className="block text-muted">{saved.addressLine1}, {saved.city} {saved.postalCode}</span></button>)}</div> : <p className="mt-3 text-sm text-muted">No saved addresses yet.</p>}</section> : <p className="rounded-2xl bg-[#f7fbfd] p-4 text-sm text-muted">You are checking out as a guest. Sign in later to save addresses and keep your order history.</p>}
		<section className="rounded-card bg-surface p-5 shadow-float"><h2 className="text-xl font-medium tracking-tight">Where should we deliver?</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field autoComplete="name" error={errors["deliveryAddress.recipientName"]} label="Recipient name" onChange={(event) => update("recipientName", event.target.value)} required value={address.recipientName} wrapperClassName="sm:col-span-2" /><div className="sm:col-span-2"><Field autoComplete="tel" error={errors["deliveryAddress.mobile"]} inputMode="tel" label="Mobile number" onChange={(event) => update("mobile", event.target.value)} placeholder="+919876543210" required type="tel" value={address.mobile} /><p className="mt-1 text-xs text-muted">Use international format, for example +919876543210.</p></div><Field autoComplete="address-line1" error={errors["deliveryAddress.addressLine1"]} label="Address line 1" onChange={(event) => update("addressLine1", event.target.value)} required value={address.addressLine1} wrapperClassName="sm:col-span-2" /><Field autoComplete="address-line2" error={errors["deliveryAddress.addressLine2"]} label="Address line 2 (optional)" onChange={(event) => update("addressLine2", event.target.value || null)} value={address.addressLine2 ?? ""} wrapperClassName="sm:col-span-2" /><Field error={errors["deliveryAddress.landmark"]} label="Landmark (optional)" onChange={(event) => update("landmark", event.target.value || null)} value={address.landmark ?? ""} wrapperClassName="sm:col-span-2" /><Field autoComplete="address-level2" error={errors["deliveryAddress.city"]} label="City" onChange={(event) => update("city", event.target.value)} required value={address.city} /><Field autoComplete="address-level1" error={errors["deliveryAddress.state"]} label="State" onChange={(event) => update("state", event.target.value)} required value={address.state} /><Field autoComplete="postal-code" error={errors["deliveryAddress.postalCode"]} label="Postal code" onChange={(event) => update("postalCode", event.target.value.toUpperCase())} required value={address.postalCode} /><label className="sm:col-span-2 grid gap-1.5 text-sm font-medium">Delivery instructions (optional)<textarea className="min-h-24 rounded-2xl border border-line bg-surface px-4 py-3 font-normal" maxLength={2000} onChange={(event) => update("deliveryInstructions", event.target.value || null)} value={address.deliveryInstructions ?? ""} /></label></div>{session.data?.user ? <label className="mt-5 flex items-center gap-2 text-sm font-medium"><input checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} type="checkbox" /> Save this address to my account</label> : null}</section></section>
		<aside className="h-fit rounded-card bg-ink p-5 text-surface shadow-float"><h2 className="text-xl font-medium tracking-tight">Order summary</h2><div className="mt-4 grid gap-2 border-t border-surface/20 pt-4 text-sm">{cart.data.lines.map((line) => <p className="flex justify-between gap-3" key={line.offeringId}><span>{line.productName} × {line.quantity}</span><span>{formatMoney(line.lineTotalMinor)}</span></p>)}</div><p className="mt-4 flex justify-between border-t border-surface/20 pt-4 text-lg font-medium"><span>Subtotal</span><span>{formatMoney(cart.data.subtotalMinor)}</span></p><p className="mt-3 rounded-2xl bg-surface/10 p-3 text-sm leading-6 text-surface/80">Cash on delivery only. The store verifies delivery availability, current prices, and stock before placing your order.</p>{notice ? <p aria-live="polite" className="mt-3 rounded-2xl bg-[#fff5f4] p-3 text-sm font-medium text-[#8e301d]">{notice}</p> : null}<Button className="mt-5 w-full" disabled={placeOrder.isPending} type="submit">{placeOrder.isPending ? "Placing your order…" : "Place COD order"}</Button></aside></form>;
}
