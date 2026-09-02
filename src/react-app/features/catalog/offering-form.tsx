import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { offeringCreateInputSchema, offeringUpdateInputSchema, type Offering, type OfferingCreateInput } from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { ApiClientError } from "../../lib/api-client";
import { useCreateOffering, useOffering, useProducts, useUpdateOffering } from "./catalog-api";
import { InventoryAdjustment } from "./inventory-pages";

type Draft = { productId: string; sku: string; label: string; packQuantity: string; weightValue: string; weightUnit: "" | "g" | "kg" | "ml" | "l"; listPriceMinor: string; discountType: "none" | "fixed" | "percentage"; discountValue: string; lowStockThreshold: string; active: boolean };
type Errors = Record<string, string>;

const emptyDraft = (): Draft => ({ productId: "", sku: "", label: "", packQuantity: "", weightValue: "", weightUnit: "", listPriceMinor: "", discountType: "none", discountValue: "0", lowStockThreshold: "0", active: false });
const draftFromOffering = (offering: Offering): Draft => ({ productId: offering.productId, sku: offering.sku, label: offering.label, packQuantity: offering.packQuantity === null ? "" : String(offering.packQuantity), weightValue: offering.weightValue === null ? "" : String(offering.weightValue), weightUnit: offering.weightUnit ?? "", listPriceMinor: String(offering.listPriceMinor), discountType: offering.discountType, discountValue: String(offering.discountValue), lowStockThreshold: String(offering.lowStockThreshold), active: offering.active });
const numberOrNull = (value: string) => value === "" ? null : Number(value);

function inputFromDraft(draft: Draft): OfferingCreateInput {
	return { productId: draft.productId, sku: draft.sku, label: draft.label, packQuantity: numberOrNull(draft.packQuantity), weightValue: numberOrNull(draft.weightValue), weightUnit: draft.weightUnit || null, listPriceMinor: Number(draft.listPriceMinor), discountType: draft.discountType, discountValue: Number(draft.discountValue), lowStockThreshold: Number(draft.lowStockThreshold), active: draft.active };
}

function errorsFor(error: unknown): Errors {
	if (!(error instanceof ApiClientError) || !Array.isArray(error.details?.issues)) return {};
	return Object.fromEntries(error.details.issues.flatMap((issue) => {
		if (!issue || typeof issue !== "object") return [];
		const value = issue as { path?: unknown; message?: unknown };
		return typeof value.path === "string" && typeof value.message === "string" ? [[value.path, value.message]] : [];
	}));
}

export function OfferingForm({ mode }: { mode: "create" | "edit" }) {
	const { offeringId } = useParams();
	const offering = useOffering(mode === "edit" ? offeringId : undefined);
	const products = useProducts({ page: 1, pageSize: 100, sortBy: "name", sortDirection: "asc" });
	if (mode === "edit" && offering.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium">Offering could not load.</h1><Button className="mt-5" onClick={() => void offering.refetch()} variant="secondary">Retry</Button></section>;
	if ((mode === "edit" && offering.isPending) || products.isPending) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float">Loading offering editor…</section>;
	return <OfferingEditor initialOffering={mode === "edit" ? offering.data : undefined} key={mode === "edit" ? `${offering.data?.id}:${offering.data?.version}` : "new"} mode={mode} offeringId={offeringId} onReload={() => void offering.refetch()} products={products.data?.items ?? []} />;
}

function OfferingEditor({ initialOffering, mode, offeringId, onReload, products }: { initialOffering?: Offering; mode: "create" | "edit"; offeringId?: string; onReload: () => void; products: Array<{ id: string; name: string }> }) {
	const navigate = useNavigate();
	const create = useCreateOffering();
	const update = useUpdateOffering();
	const [draft, setDraft] = useState<Draft>(() => initialOffering ? draftFromOffering(initialOffering) : emptyDraft());
	const [errors, setErrors] = useState<Errors>({});
	const [notice, setNotice] = useState<string | null>(null);
	const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); setNotice(null); };

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const base = inputFromDraft(draft);
		try {
			let saved: Offering;
			if (mode === "create") {
				const parsed = offeringCreateInputSchema.safeParse(base);
				if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]))); setNotice("Please correct the highlighted fields."); return; }
				saved = await create.mutateAsync(parsed.data);
			} else {
				const parsed = offeringUpdateInputSchema.safeParse({ sku: base.sku, label: base.label, packQuantity: base.packQuantity, weightValue: base.weightValue, weightUnit: base.weightUnit, listPriceMinor: base.listPriceMinor, discountType: base.discountType, discountValue: base.discountValue, lowStockThreshold: base.lowStockThreshold, active: base.active, version: initialOffering?.version });
				if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]))); setNotice("Please correct the highlighted fields."); return; }
				saved = await update.mutateAsync({ id: offeringId!, input: parsed.data });
			}
			setDraft(draftFromOffering(saved));
			setNotice("Offering saved.");
			if (mode === "create") navigate(`/cms/offerings/${saved.id}`, { replace: true });
		} catch (error) { setErrors(errorsFor(error)); setNotice(error instanceof Error ? error.message : "Offering could not be saved."); }
	};

	const busy = create.isPending || update.isPending;
	const discountLabel = draft.discountType === "percentage" ? "Discount (basis points)" : draft.discountType === "fixed" ? "Discount amount (minor units)" : "Discount amount";
	return <div className="mx-auto max-w-5xl space-y-5 pb-28">
		<form className="space-y-5" noValidate onSubmit={(event) => void submit(event)}>
			<header className="rounded-card bg-ink p-5 text-surface shadow-float sm:flex sm:items-end sm:justify-between sm:p-7"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Sellable offering</p><h1 className="mt-2 text-3xl font-medium tracking-tight">{mode === "create" ? "New offering" : initialOffering?.sku}</h1><p className="mt-2 text-sm text-surface/70">Stock is adjusted separately so every count remains auditable.</p></div><Button className="mt-4 sm:mt-0" onClick={() => navigate("/cms/offerings")} type="button" variant="secondary">Back to offerings</Button></header>
			{notice ? <p aria-live="assertive" className="rounded-2xl border border-[#b8d4df] bg-[#f2f8fb] px-4 py-3 text-sm font-medium text-[#4f8194]">{notice}{notice.includes("changed") ? <Button className="ml-3 min-h-8 px-3 text-xs" onClick={onReload} type="button" variant="secondary">Reload latest</Button> : null}</p> : null}
			<section className="rounded-card border border-white/70 bg-surface p-5 shadow-float sm:p-7"><div className="grid gap-4 sm:grid-cols-2">
				<label className="grid gap-1.5 text-sm font-medium sm:col-span-2" htmlFor="offering-product">Product<select className="min-h-12 rounded-2xl border border-line bg-surface px-4 font-normal" disabled={mode === "edit"} id="offering-product" onChange={(event) => set("productId", event.target.value)} value={draft.productId}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{errors.productId ? <span className="text-[#ae3f27]">{errors.productId}</span> : null}</label>
				<Field error={errors.sku} label="SKU" onChange={(event) => set("sku", event.target.value)} value={draft.sku} /><Field error={errors.label} label="Pack label" onChange={(event) => set("label", event.target.value)} value={draft.label} /><Field error={errors.packQuantity} label="Pack quantity" min="1" onChange={(event) => set("packQuantity", event.target.value)} type="number" value={draft.packQuantity} /><Field error={errors.weightValue} label="Weight value" min="1" onChange={(event) => set("weightValue", event.target.value)} type="number" value={draft.weightValue} />
				<label className="grid gap-1.5 text-sm font-medium" htmlFor="offering-weight-unit">Weight unit<select className="min-h-12 rounded-2xl border border-line bg-surface px-4 font-normal" id="offering-weight-unit" onChange={(event) => set("weightUnit", event.target.value as Draft["weightUnit"])} value={draft.weightUnit}><option value="">No weight</option><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option></select></label>
				<Field error={errors.listPriceMinor} label="List price (minor units)" min="1" onChange={(event) => set("listPriceMinor", event.target.value)} type="number" value={draft.listPriceMinor} />
				<label className="grid gap-1.5 text-sm font-medium" htmlFor="offering-discount-type">Discount type<select className="min-h-12 rounded-2xl border border-line bg-surface px-4 font-normal" id="offering-discount-type" onChange={(event) => set("discountType", event.target.value as Draft["discountType"])} value={draft.discountType}><option value="none">No discount</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option></select></label>
				<Field disabled={draft.discountType === "none"} error={errors.discountValue} label={discountLabel} min="0" onChange={(event) => set("discountValue", event.target.value)} type="number" value={draft.discountValue} /><Field error={errors.lowStockThreshold} label="Low stock threshold" min="0" onChange={(event) => set("lowStockThreshold", event.target.value)} type="number" value={draft.lowStockThreshold} /><label className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 text-sm font-medium"><input checked={draft.active} className="size-5 accent-action" onChange={(event) => set("active", event.target.checked)} type="checkbox" />Active</label>
			</div></section>
			<div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 p-3 backdrop-blur md:left-60"><div className="mx-auto flex max-w-5xl justify-end"><Button disabled={busy} type="submit">{busy ? "Saving…" : "Save offering"}</Button></div></div>
		</form>
		{mode === "edit" && initialOffering ? <InventoryAdjustment offering={initialOffering} onReload={onReload} /> : null}
	</div>;
}
