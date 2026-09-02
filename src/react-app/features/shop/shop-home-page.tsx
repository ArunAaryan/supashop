import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { publicProductListQuerySchema } from "../../../shared/contracts/catalog";
import { Field } from "../../components/field";
import { usePublicCategories, usePublicProducts } from "./public-catalog-api";
import { ShopEmpty, ShopError, ShopLoading, ShopProductGrid } from "./shop-components";

function productsQuery(categorySlug: string | undefined) {
	const defaults = { page: 1, pageSize: 20, inStock: true, sortBy: "name", sortDirection: "asc" } as const;
	const parsed = publicProductListQuerySchema.safeParse({ ...defaults, categorySlug });
	return parsed.success ? parsed.data : publicProductListQuerySchema.parse(defaults);
}

export function ShopHomePage() {
	const [params, setParams] = useSearchParams();
	const categorySlug = params.get("category")?.trim() || undefined;
	const categories = usePublicCategories();
	const products = usePublicProducts(useMemo(() => productsQuery(categorySlug), [categorySlug]));

	function chooseCategory(slug: string | undefined) {
		setParams(slug ? { category: slug } : {});
	}

	return <div className="space-y-6 pb-4">
		<section className="overflow-hidden rounded-card bg-ink p-6 text-surface shadow-float sm:p-9">
			<p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Fresh from your neighbourhood store</p>
			<h1 className="mt-3 max-w-2xl text-3xl font-medium tracking-tight sm:text-4xl">Essentials for today, delivered simply.</h1>
			<form action="/search" className="mt-6 max-w-xl"><Field aria-label="Search the shop" label="Search the shop" name="q" placeholder="Milk, bread, fruit…" /></form>
			<Link className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-action px-5 text-sm font-medium text-ink shadow-[0_8px_0_#a5d2e2]" to="/search">Browse all products</Link>
		</section>
		<section aria-labelledby="shop-categories" className="min-w-0">
			<div className="flex items-center justify-between gap-3"><h2 className="text-xl font-medium tracking-tight" id="shop-categories">Shop by category</h2>{categorySlug ? <button className="text-sm font-medium text-focus underline-offset-4 hover:underline" onClick={() => chooseCategory(undefined)} type="button">Clear filter</button> : null}</div>
			<div className="mt-3 flex gap-2 overflow-x-auto pb-1">
				<button aria-pressed={!categorySlug} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${!categorySlug ? "border-action bg-action" : "border-line bg-surface"}`} onClick={() => chooseCategory(undefined)} type="button">All</button>
				{categories.data?.map((category) => <button aria-pressed={categorySlug === category.slug} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${categorySlug === category.slug ? "border-action bg-action" : "border-line bg-surface"}`} key={category.id} onClick={() => chooseCategory(category.slug)} type="button">{category.name}</button>)}
			</div>
		</section>
		<section aria-labelledby="shop-products">
			<h2 className="mb-3 text-xl font-medium tracking-tight" id="shop-products">{categorySlug ? "Category picks" : "Available today"}</h2>
			{products.isPending ? <ShopLoading /> : products.isError ? <ShopError onRetry={() => void products.refetch()}>We could not load products.</ShopError> : products.data?.items.length ? <ShopProductGrid items={products.data.items} /> : <ShopEmpty>No products are available in this view yet.</ShopEmpty>}
		</section>
	</div>;
}
