import { useMemo, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { publicSearchQuerySchema, type PublicSearchQuery } from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { usePublicCategories, usePublicSearch, usePublicTags } from "./public-catalog-api";
import { ShopEmpty, ShopError, ShopLoading, ShopProductGrid } from "./shop-components";

function stateFromParams(params: URLSearchParams): PublicSearchQuery | undefined {
	const search = params.get("q")?.trim();
	if (!search || search.length > 100) return undefined;
	const defaults = { page: 1, pageSize: 20, search, sortBy: "relevance", sortDirection: "desc" } as const;
	const parsed = publicSearchQuerySchema.safeParse({
		page: Number(params.get("page") ?? 1), pageSize: 20, search,
		categorySlug: params.get("category")?.trim() || undefined, tagSlug: params.get("tag")?.trim() || undefined,
		inStock: params.get("inStock") === "true" ? true : undefined,
		sortBy: params.get("sort") || "relevance", sortDirection: params.get("direction") || "desc",
	});
	return parsed.success ? parsed.data : publicSearchQuerySchema.parse(defaults);
}

export function ShopSearchPage() {
	const [params, setParams] = useSearchParams();
	const urlQuery = params.get("q") ?? "";
	const state = useMemo(() => stateFromParams(params), [params]);
	const categories = usePublicCategories();
	const tags = usePublicTags();
	const search = usePublicSearch(state);
	const write = (changes: Record<string, string | undefined>) => {
		const next = new URLSearchParams(params);
		for (const [key, value] of Object.entries(changes)) {
			if (value) next.set(key, value);
			else next.delete(key);
		}
		next.delete("page");
		setParams(next);
	};
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const q = new FormData(event.currentTarget).get("q");
		write({ q: typeof q === "string" ? q.trim() || undefined : undefined });
	};

	return <div className="space-y-5 pb-4">
		<header><p className="text-xs font-medium uppercase tracking-[0.16em] text-focus">Find what you need</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Search the shop</h1></header>
		<form className="grid gap-3 rounded-card bg-surface p-4 shadow-float sm:grid-cols-[1fr_auto]" onSubmit={submit}><Field defaultValue={urlQuery} key={urlQuery} label="Search products" name="q" placeholder="Try milk or fruit" /><Button className="sm:self-end" type="submit">Search</Button></form>
		{state ? <>
			<section aria-label="Search filters" className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-3">
				<label className="grid gap-1.5 text-sm font-medium">Category<select className="min-h-11 rounded-2xl border border-line bg-surface px-3" onChange={(event) => write({ category: event.target.value || undefined })} value={params.get("category") ?? ""}><option value="">All categories</option>{categories.data?.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select></label>
				<label className="grid gap-1.5 text-sm font-medium">Tag<select className="min-h-11 rounded-2xl border border-line bg-surface px-3" onChange={(event) => write({ tag: event.target.value || undefined })} value={params.get("tag") ?? ""}><option value="">All tags</option>{tags.data?.map((tag) => <option key={tag.id} value={tag.slug}>{tag.name}</option>)}</select></label>
				<label className="grid gap-1.5 text-sm font-medium">Sort<select className="min-h-11 rounded-2xl border border-line bg-surface px-3" onChange={(event) => write({ sort: event.target.value })} value={params.get("sort") ?? "relevance"}><option value="relevance">Most relevant</option><option value="name">Name</option><option value="price">Price</option><option value="newest">Newest</option></select></label>
				<label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input checked={params.get("inStock") === "true"} onChange={(event) => write({ inStock: event.target.checked ? "true" : undefined })} type="checkbox" /> In stock only</label>
			</section>
			<p aria-live="polite" className="text-sm text-muted">{search.data ? `${search.data.totalItems} ${search.data.totalItems === 1 ? "result" : "results"}` : "Searching…"}</p>
			{search.isPending ? <ShopLoading label="Searching products…" /> : search.isError ? <ShopError onRetry={() => void search.refetch()}>We could not search the shop.</ShopError> : search.data?.items.length ? <ShopProductGrid items={search.data.items} /> : <ShopEmpty>No products matched that search.</ShopEmpty>}
		</> : <ShopEmpty>Start with a product, category, or brand.</ShopEmpty>}
	</div>;
}
