import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
	productCreateInputSchema,
	productUpdateInputSchema,
	type ProductCreateInput,
	type ProductDetail,
} from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { ApiClientError } from "../../lib/api-client";
import { useCategories, useCreateProduct, useProduct, useTags, useUpdateProduct } from "./catalog-api";
import { ProductGallery } from "./product-gallery";

type FormErrors = Record<string, string>;
type ProductDraft = Omit<ProductCreateInput, "baseWeightValue" | "baseWeightUnit"> & {
	baseWeightValue: string;
	baseWeightUnit: "" | "g" | "kg" | "ml" | "l";
};

function emptyDraft(): ProductDraft {
	return { code: "", slug: "", name: "", description: "", baseWeightValue: "", baseWeightUnit: "", categoryId: "", tagIds: [], active: false };
}

function draftFromProduct(product: ProductDetail): ProductDraft {
	return {
		code: product.code,
		slug: product.slug,
		name: product.name,
		description: product.description,
		baseWeightValue: product.baseWeightValue === null ? "" : String(product.baseWeightValue),
		baseWeightUnit: product.baseWeightUnit ?? "",
		categoryId: product.categoryId,
		tagIds: product.tags.map((tag) => tag.id),
		active: product.active,
	};
}

function inputFromDraft(draft: ProductDraft): ProductCreateInput {
	return {
		...draft,
		baseWeightValue: draft.baseWeightValue === "" ? null : Number(draft.baseWeightValue),
		baseWeightUnit: draft.baseWeightUnit || null,
	};
}

function errorsFor(error: unknown): FormErrors {
	if (!(error instanceof ApiClientError)) return {};
	const issues = error.details?.issues;
	if (!Array.isArray(issues)) return {};
	return Object.fromEntries(issues.flatMap((issue) => {
		if (!issue || typeof issue !== "object") return [];
		const candidate = issue as { path?: unknown; message?: unknown };
		const path = Array.isArray(candidate.path) ? candidate.path.join(".") : candidate.path;
		return typeof path === "string" && typeof candidate.message === "string" ? [[path, candidate.message]] : [];
	}));
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
	return <section className="rounded-card border border-white/70 bg-surface p-5 shadow-float sm:p-7"><div className="border-b border-line pb-4"><h2 className="text-xl font-black tracking-tight">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div><div className="mt-5">{children}</div></section>;
}

export function ProductForm({ mode }: { mode: "create" | "edit" }) {
	const navigate = useNavigate();
	const { productId } = useParams();
	const product = useProduct(mode === "edit" ? productId : undefined);
	const categories = useCategories({ page: 1, pageSize: 100, active: true, sortBy: "name", sortDirection: "asc" });
	const tags = useTags({ page: 1, pageSize: 100, active: true, sortBy: "name", sortDirection: "asc" });
	const create = useCreateProduct();
	const update = useUpdateProduct();
	const [form, setForm] = useState<{ productId: string | null; draft: ProductDraft }>({ productId: null, draft: emptyDraft() });
	const [errors, setErrors] = useState<FormErrors>({});
	const [notice, setNotice] = useState<string | null>(null);

	const currentProduct = product.data;
	const draft = mode === "edit" && currentProduct && form.productId !== currentProduct.id ? draftFromProduct(currentProduct) : form.draft;
	const selectedCategory = categories.data?.items.find((category) => category.id === draft.categoryId) ?? currentProduct?.category;
	const mayActivate = mode === "edit" && Boolean(selectedCategory?.active && currentProduct && currentProduct.activeOfferingCount > 0);
	const busy = create.isPending || update.isPending;
	const ready = mode === "create" ? !categories.isPending && !tags.isPending : !product.isPending && !categories.isPending && !tags.isPending;
	const title = mode === "create" ? "New product" : currentProduct?.name ?? "Edit product";

	const updateDraft = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
		setForm((current) => ({
			productId: currentProduct?.id ?? null,
			draft: {
				...(mode === "edit" && currentProduct && current.productId !== currentProduct.id ? draftFromProduct(currentProduct) : current.draft),
				[key]: value,
			},
		}));
		setErrors((current) => {
			const next = { ...current };
			delete next[String(key)];
			return next;
		});
		setNotice(null);
	};
	const toggleTag = (tagId: string, checked: boolean) => updateDraft("tagIds", checked ? [...draft.tagIds, tagId] : draft.tagIds.filter((id) => id !== tagId));
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const base = inputFromDraft(draft);
		const parsed = mode === "create"
			? productCreateInputSchema.safeParse(base)
			: productUpdateInputSchema.safeParse({ ...base, version: currentProduct?.version });
		if (!parsed.success) {
			setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
			setNotice("Please correct the highlighted fields.");
			return;
		}
		setErrors({});
		setNotice(null);
		try {
			const saved = mode === "create"
				? await create.mutateAsync(productCreateInputSchema.parse(base))
				: await update.mutateAsync({ id: productId!, input: productUpdateInputSchema.parse({ ...base, version: currentProduct?.version }) });
			if (mode === "create") navigate(`/cms/products/${saved.id}`, { replace: true });
		else setForm({ productId: saved.id, draft: draftFromProduct(saved) });
			setNotice("Product saved.");
		} catch (error) {
			setErrors(errorsFor(error));
			setNotice(error instanceof Error ? error.message : "We could not save this product.");
		}
	};
	const reload = async () => {
		const refreshed = await product.refetch();
		if (refreshed.data) {
			setForm({ productId: refreshed.data.id, draft: draftFromProduct(refreshed.data) });
			setErrors({});
			setNotice("Reloaded the latest product.");
		}
	};

	if (mode === "edit" && product.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-black">Product could not load.</h1><p className="mt-2 text-sm text-muted">{product.error.message}</p><Button className="mt-5" onClick={() => void product.refetch()} variant="secondary">Retry</Button></section>;
	if (!ready) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float"><p className="font-bold">Loading product editor…</p></section>;

	return <form className="mx-auto max-w-6xl space-y-5 pb-28" noValidate onSubmit={(event) => void submit(event)}>
		<header className="rounded-card bg-ink p-5 text-surface shadow-float sm:flex sm:items-end sm:justify-between sm:p-7"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-action">Catalog product</p><h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-surface/70">Build a dependable master record before you publish sellable configurations.</p></div><Button className="mt-4 sm:mt-0" onClick={() => navigate("/cms/products")} type="button" variant="secondary">Back to products</Button></header>
		{notice ? <p aria-live="assertive" className={`rounded-2xl border px-4 py-3 text-sm font-bold ${notice === "Product saved." || notice.startsWith("Reloaded") ? "border-[#b7dfaa] bg-[#eff9eb] text-[#28633e]" : "border-[#e8a28f] bg-[#fff0ea] text-[#8e301d]"}`}>{errors[""] ?? notice}{notice.includes("changed") ? <Button className="ml-3 min-h-8 px-3 text-xs" onClick={() => void reload()} type="button" variant="secondary">Reload latest</Button> : null}</p> : null}
		<div className="grid gap-5 xl:grid-cols-2">
			<Section description="Codes and names let staff find the right master record quickly." title="Identity"><div className="grid gap-4 sm:grid-cols-2"><Field error={errors.code} label="Product code" onChange={(event) => updateDraft("code", event.target.value)} value={draft.code} /><Field error={errors.slug} label="Slug" onChange={(event) => updateDraft("slug", event.target.value)} value={draft.slug} /><Field error={errors.name} label="Product name" onChange={(event) => updateDraft("name", event.target.value)} value={draft.name} wrapperClassName="sm:col-span-2" /><label className="grid gap-1.5 text-sm font-bold sm:col-span-2" htmlFor="product-description">Description<textarea aria-describedby={errors.description ? "product-description-error" : undefined} aria-invalid={Boolean(errors.description)} className={`min-h-28 resize-y rounded-2xl border bg-surface px-4 py-3 font-normal outline-none focus:border-action ${errors.description ? "border-action" : "border-line"}`} id="product-description" onChange={(event) => updateDraft("description", event.target.value)} value={draft.description} />{errors.description ? <span className="font-normal text-[#ae3f27]" id="product-description-error">{errors.description}</span> : null}</label></div></Section>
			<Section description="Base weight is optional, but quantity and unit must always travel together." title="Classification & base weight"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-bold sm:col-span-2" htmlFor="product-category">Category<select aria-describedby={errors.categoryId ? "product-category-error" : undefined} aria-invalid={Boolean(errors.categoryId)} className={`min-h-12 rounded-2xl border bg-surface px-4 font-normal outline-none focus:border-action ${errors.categoryId ? "border-action" : "border-line"}`} id="product-category" onChange={(event) => updateDraft("categoryId", event.target.value)} value={draft.categoryId}><option value="">Select a category</option>{categories.data?.items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{errors.categoryId ? <span className="font-normal text-[#ae3f27]" id="product-category-error">{errors.categoryId}</span> : null}</label><Field error={errors.baseWeightValue} label="Base weight" min="1" onChange={(event) => updateDraft("baseWeightValue", event.target.value)} type="number" value={draft.baseWeightValue} /><label className="grid gap-1.5 text-sm font-bold" htmlFor="base-weight-unit">Base weight unit<select aria-describedby={errors.baseWeightUnit ? "base-weight-unit-error" : undefined} aria-invalid={Boolean(errors.baseWeightUnit)} className={`min-h-12 rounded-2xl border bg-surface px-4 font-normal outline-none focus:border-action ${errors.baseWeightUnit ? "border-action" : "border-line"}`} id="base-weight-unit" onChange={(event) => updateDraft("baseWeightUnit", event.target.value as ProductDraft["baseWeightUnit"])} value={draft.baseWeightUnit}><option value="">No base weight</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option></select>{errors.baseWeightUnit ? <span className="font-normal text-[#ae3f27]" id="base-weight-unit-error">{errors.baseWeightUnit}</span> : null}</label></div></Section>
			<Section description="Only active tags can be assigned to new product records." title="Tags"><fieldset><legend className="sr-only">Tags</legend><div className="grid gap-2 sm:grid-cols-2">{tags.data?.items.map((tag) => <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold" key={tag.id}><input checked={draft.tagIds.includes(tag.id)} className="size-4 accent-action" onChange={(event) => toggleTag(tag.id, event.target.checked)} type="checkbox" />{tag.name}</label>)}</div>{tags.data?.items.length === 0 ? <p className="text-sm text-muted">Create active tags to assign them here.</p> : null}{errors.tagIds ? <p className="mt-2 text-sm text-[#ae3f27]">{errors.tagIds}</p> : null}</fieldset></Section>
			<Section description="An active product also needs an active category and at least one active offering." title="Publishing"><label className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 text-sm font-bold"><input checked={draft.active} className="size-5 accent-action" disabled={!mayActivate && !draft.active} onChange={(event) => updateDraft("active", event.target.checked)} type="checkbox" />Active — visible to the catalog once it has an offering</label>{!mayActivate && !draft.active ? <p className="mt-3 text-sm text-muted">Save this product as a draft first, then add an active offering before activating it.</p> : null}{errors.active ? <p className="mt-2 text-sm text-[#ae3f27]">{errors.active}</p> : null}</Section>
		</div>
		<Section description="Images are added only after the product record exists." title="Product gallery">{mode === "create" ? <div className="rounded-2xl border border-dashed border-line bg-[#fff7f2] p-5 text-sm text-muted">Save this product before adding images.</div> : currentProduct ? <ProductGallery product={currentProduct} /> : null}</Section>
		<div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 p-3 backdrop-blur md:left-60"><div className="mx-auto flex max-w-6xl justify-end"><Button disabled={busy} type="submit">{busy ? "Saving…" : "Save product"}</Button></div></div>
	</form>;
}
