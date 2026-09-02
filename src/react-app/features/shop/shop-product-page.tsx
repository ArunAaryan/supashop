import { useState } from "react";

import type { Offering } from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { formatMoney } from "../../lib/format-money";
import { useAddCartItem } from "../cart/cart-api";
import { usePublicProduct } from "./public-catalog-api";
import { ShopEmpty, ShopError, ShopLoading, ShopPrice } from "./shop-components";
import { offeringLabel } from "./shop-utils";

export function ShopProductPage({ slug }: { slug: string }) {
	const product = usePublicProduct(slug);
	const addItem = useAddCartItem();
	const [selectedOfferingId, setSelectedOfferingId] = useState<string>();
	const [selectedImageId, setSelectedImageId] = useState<string>();
	if (product.isPending) return <ShopLoading label="Loading product…" />;
	if (product.isError) return <ShopError onRetry={() => void product.refetch()}>We could not load this product.</ShopError>;
	if (!product.data) return <ShopEmpty>This product is not available.</ShopEmpty>;
	const selected = product.data.offerings.find((offering) => offering.id === selectedOfferingId) ?? product.data.offerings.find((offering) => offering.inStock) ?? product.data.offerings[0];
	const selectedImage = product.data.images.find((image) => image.id === selectedImageId) ?? product.data.images[0];
	if (!selected) return <ShopEmpty>This product has no available pack sizes.</ShopEmpty>;
	return <article className="grid min-w-0 gap-6 pb-4 lg:grid-cols-2">
		<section className="overflow-hidden rounded-card bg-surface shadow-float"><div className="grid aspect-square place-items-center bg-[#f7fbfd]">{selectedImage ? <img alt={selectedImage.altText} className="size-full object-cover" src={selectedImage.url} /> : <span className="text-sm text-muted">Product image coming soon</span>}</div>{product.data.images.length > 1 ? <div aria-label="Product image gallery" className="flex gap-2 overflow-x-auto p-3" role="group">{product.data.images.map((image, index) => <button aria-label={`View image ${index + 1}: ${image.altText}`} aria-pressed={selectedImage?.id === image.id} className={`shrink-0 rounded-xl focus-visible:outline-offset-2 ${selectedImage?.id === image.id ? "ring-2 ring-focus" : ""}`} key={image.id} onClick={() => setSelectedImageId(image.id)} type="button"><img alt="" className="size-16 rounded-xl border border-line object-cover" src={image.url} /></button>)}</div> : null}</section>
		<section className="min-w-0 rounded-card bg-surface p-5 shadow-float sm:p-7"><p className="text-xs font-medium uppercase tracking-[0.16em] text-focus">{product.data.category.name}</p><h1 className="mt-2 text-3xl font-medium tracking-tight">{product.data.name}</h1><p className="mt-3 text-sm leading-6 text-muted">{product.data.description || "Details will be added soon."}</p>
			<fieldset className="mt-6"><legend className="text-lg font-medium">Choose a pack</legend><div className="mt-3 grid gap-3">{product.data.offerings.map((offering) => <OfferingChoice checked={selected.id === offering.id} key={offering.id} offering={offering} onChange={() => setSelectedOfferingId(offering.id)} />)}</div></fieldset>
			<div className="mt-6 rounded-2xl bg-[#f7fbfd] p-4"><p className="text-sm font-medium">{offeringLabel(selected)}</p><ShopPrice offering={selected} /><p className={`mt-2 text-sm font-medium ${selected.inStock ? "text-[#28633e]" : "text-focus"}`}>{selected.inStock ? selected.lowStock ? "Low stock" : "In stock" : "Out of stock"}</p></div>
			<Button className="mt-5 w-full" disabled={!selected.inStock || addItem.isPending} onClick={() => addItem.mutate({ offeringId: selected.id, quantity: 1 })}>{selected.inStock ? addItem.isPending ? "Adding…" : "Add to cart" : "Out of stock"}</Button>
			{addItem.isError ? <p aria-live="polite" className="mt-3 text-center text-xs font-medium text-focus">We could not add this item. Please try again.</p> : null}
		</section>
	</article>;
}

function OfferingChoice({ offering, checked, onChange }: { offering: Offering; checked: boolean; onChange: () => void }) {
	return <label className={`flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3 ${checked ? "border-action bg-[#f7fbfd]" : "border-line"}`}>
		<span className="flex min-w-0 items-center gap-3"><input checked={checked} name="offering" onChange={onChange} type="radio" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{offeringLabel(offering)}</span><span className="text-xs text-muted">{offering.inStock ? "Available" : "Out of stock"}</span></span></span>
		<span className="shrink-0 text-sm font-medium">{formatMoney(offering.effectivePriceMinor)}</span>
	</label>;
}
