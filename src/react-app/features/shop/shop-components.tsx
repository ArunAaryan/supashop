import type { PropsWithChildren } from "react";
import { Link } from "react-router-dom";

import type { Offering, ProductImage, ProductSummary } from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { formatMoney } from "../../lib/format-money";

export function ShopLoading({ label = "Loading products…" }: { label?: string }) {
	return <div aria-busy="true" aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
		{Array.from({ length: 4 }, (_, index) => <div className="h-64 animate-pulse rounded-card bg-surface shadow-float motion-reduce:animate-none" key={index} />)}
	</div>;
}

export function ShopError({ children, onRetry }: PropsWithChildren<{ onRetry: () => void }>) {
	return <section className="rounded-card border border-line bg-surface p-6 text-center shadow-float">
		<h1 className="text-2xl font-medium tracking-tight">{children}</h1>
		<p className="mt-2 text-sm leading-6 text-muted">Check your connection and try again.</p>
		<Button className="mt-5" onClick={onRetry} variant="secondary">Retry</Button>
	</section>;
}

export function ShopEmpty({ children }: PropsWithChildren) {
	return <section className="rounded-card border border-dashed border-line bg-surface p-8 text-center shadow-float">
		<h1 className="text-xl font-medium tracking-tight">{children}</h1>
	</section>;
}

function ProductImage({ image, name }: { image: ProductImage | null; name: string }) {
	if (!image) return <div aria-label={`No image available for ${name}`} className="grid aspect-square place-items-center bg-[#f7fbfd] text-sm text-muted">No image yet</div>;
	return <img alt={image.altText} className="aspect-square w-full object-cover" src={image.url} />;
}

export function ShopPrice({ offering }: { offering: Pick<Offering, "listPriceMinor" | "effectivePriceMinor" | "discountMinor"> }) {
	return <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
		<span className="text-lg font-medium">{formatMoney(offering.effectivePriceMinor)}</span>
		{offering.discountMinor > 0 ? <><span className="text-muted line-through">{formatMoney(offering.listPriceMinor)}</span><span className="rounded-full bg-action px-2 py-0.5 text-xs font-medium">Save {formatMoney(offering.discountMinor)}</span></> : null}
	</p>;
}

export function ShopProductCard({ product }: { product: ProductSummary }) {
	return <article className="group min-w-0 overflow-hidden rounded-card border border-white/70 bg-surface shadow-float">
		<Link aria-label={`View ${product.name}`} className="block focus-visible:outline-offset-[-4px]" to={`/products/${product.slug}`}>
			<ProductImage image={product.primaryImage} name={product.name} />
			<div className="min-w-0 p-4">
				<p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-focus">{product.category.name}</p>
				<h2 className="mt-1 truncate text-base font-medium tracking-tight">{product.name}</h2>
				<p className="mt-2 text-lg font-medium">{product.minimumEffectivePriceMinor === null ? "Prices coming soon" : `From ${formatMoney(product.minimumEffectivePriceMinor)}`}</p>
				<div className="mt-3 flex flex-wrap gap-2 text-xs font-medium"><span className={`rounded-full px-2 py-1 ${product.inStock ? "bg-[#e7f5df] text-[#28633e]" : "bg-[#f2f8fb] text-focus"}`}>{product.inStock ? "Available" : "Out of stock"}</span>{product.hasPromotion ? <span className="rounded-full bg-action px-2 py-1">Offer</span> : null}</div>
			</div>
		</Link>
	</article>;
}

export function ShopProductGrid({ items }: { items: ProductSummary[] }) {
	return <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">{items.map((product) => <ShopProductCard key={product.id} product={product} />)}</div>;
}
