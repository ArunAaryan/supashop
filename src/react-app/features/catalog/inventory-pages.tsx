import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useSearchParams } from "react-router-dom";

import { cmsInventoryMovementListQuerySchema, inventoryAdjustmentInputSchema, type CmsInventoryMovementListQuery, type Offering, type InventoryMovement } from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { DataTable } from "../../components/data-table";
import { Field } from "../../components/field";
import { ApiClientError } from "../../lib/api-client";
import { useAdjustInventory, useInventoryMovements } from "./catalog-api";
import { readListState, writeListState, type ListState } from "./list-state";

function queryFromState(state: ListState, offeringId?: string): CmsInventoryMovementListQuery {
	return cmsInventoryMovementListQuerySchema.parse({ page: state.page, pageSize: state.pageSize, offeringId, sortBy: "createdAt", sortDirection: "desc" });
}

function errorsFor(error: unknown): Record<string, string> {
	if (!(error instanceof ApiClientError) || !Array.isArray(error.details?.issues)) return {};
	return Object.fromEntries(error.details.issues.flatMap((issue) => {
		if (!issue || typeof issue !== "object") return [];
		const value = issue as { path?: unknown; message?: unknown };
		return typeof value.path === "string" && typeof value.message === "string" ? [[value.path, value.message]] : [];
	}));
}

export function InventoryAdjustment({ offering, onReload }: { offering: Offering; onReload: () => void }) {
	const adjust = useAdjustInventory();
	const [desired, setDesired] = useState(String(offering.stockQuantity));
	const [reason, setReason] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const desiredQuantity = desired === "" ? Number.NaN : Number(desired);
	const delta = Number.isInteger(desiredQuantity) ? desiredQuantity - offering.stockQuantity : 0;
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const parsed = inventoryAdjustmentInputSchema.safeParse({ stockQuantity: desiredQuantity, reason, version: offering.version });
		if (!parsed.success) {
			setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
			return;
		}
		setErrors({}); setNotice(null);
		try { await adjust.mutateAsync({ id: offering.id, input: parsed.data }); setReason(""); setNotice("Inventory adjusted."); }
		catch (error) { setErrors(errorsFor(error)); setNotice(error instanceof Error ? error.message : "Inventory could not be adjusted."); }
	};
	return <section className="rounded-card border border-white/70 bg-surface p-5 shadow-float sm:p-7"><h2 className="text-xl font-medium">Adjust inventory</h2><p className="mt-1 text-sm text-muted">Set the absolute stock count. Every change is recorded in the ledger.</p><form className="mt-5 grid gap-4 sm:grid-cols-2" noValidate onSubmit={(event) => void submit(event)}><Field error={errors.stockQuantity} label="Desired stock count" min="0" onChange={(event) => setDesired(event.target.value)} type="number" value={desired} /><label className="grid gap-1.5 text-sm font-medium sm:col-span-2" htmlFor="inventory-reason">Reason<textarea aria-describedby={errors.reason ? "inventory-reason-error" : undefined} aria-invalid={Boolean(errors.reason)} className={`min-h-24 rounded-2xl border bg-surface px-4 py-3 font-normal outline-none focus:border-action ${errors.reason ? "border-action" : "border-line"}`} id="inventory-reason" onChange={(event) => setReason(event.target.value)} value={reason} />{errors.reason ? <span className="font-normal text-[#ae3f27]" id="inventory-reason-error">{errors.reason}</span> : null}</label><p aria-live="polite" className="text-sm font-medium sm:col-span-2">Stock change: {delta > 0 ? "+" : ""}{delta}</p>{notice ? <p aria-live="assertive" className="text-sm font-medium text-[#4f8194] sm:col-span-2">{notice}{notice.includes("changed") ? <Button className="ml-3 min-h-8 px-3 text-xs" onClick={onReload} type="button" variant="secondary">Reload latest</Button> : null}</p> : null}<Button disabled={adjust.isPending || delta === 0} type="submit">{adjust.isPending ? "Adjusting…" : "Adjust inventory"}</Button></form></section>;
}

export function InventoryMovementsPage() {
	const [params, setParams] = useSearchParams();
	const state = useMemo(() => readListState(params), [params]);
	const offeringId = params.get("offeringId") || undefined;
	const query = useMemo(() => queryFromState(state, offeringId), [state, offeringId]);
	const movements = useInventoryMovements(query);
	const sorting: SortingState = [{ id: "createdAt", desc: true }];
	const columns = useMemo<ColumnDef<InventoryMovement, unknown>[]>(() => [
		{ accessorKey: "createdAt", header: "When", cell: ({ row }) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(row.original.createdAt) },
		{ accessorKey: "offeringId", header: "Offering" },
		{ accessorKey: "quantityDelta", header: "Change", cell: ({ row }) => <strong>{row.original.quantityDelta > 0 ? "+" : ""}{row.original.quantityDelta}</strong> },
		{ accessorKey: "resultingQuantity", header: "Resulting stock" },
		{ accessorKey: "reason", header: "Reason" },
	], []);
	if (movements.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium">Inventory ledger could not load.</h1><p className="mt-2 text-sm text-muted">{movements.error.message}</p><Button className="mt-5" onClick={() => void movements.refetch()} variant="secondary">Retry</Button></section>;
	return <div className="mx-auto max-w-7xl space-y-5"><header className="rounded-card bg-ink p-5 text-surface shadow-float sm:p-7"><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Read-only inventory ledger</p><h1 className="mt-2 text-3xl font-medium tracking-tight">Every stock change has a trace.</h1></header><section className="rounded-card border border-white/70 bg-surface p-5 shadow-float"><Field defaultValue={offeringId} label="Filter by offering ID" onChange={(event) => { const next = writeListState({ ...state, page: 1 }); if (event.target.value) next.set("offeringId", event.target.value); else next.delete("offeringId"); setParams(next); }} /></section><DataTable columns={columns} data={movements.data?.items ?? []} emptyMessage="No inventory movements match this view." isLoading={movements.isPending || movements.isFetching} onPageChange={(pageIndex) => setParams(writeListState({ ...state, page: pageIndex + 1 }))} onSortingChange={() => undefined} pageIndex={state.page - 1} pageSize={state.pageSize} rowCount={movements.data?.totalItems ?? 0} sorting={sorting} /></div>;
}
