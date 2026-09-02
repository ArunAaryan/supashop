import { useMemo, useState, type FormEvent } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useSearchParams } from "react-router-dom";

import {
	categoryCreateInputSchema,
	cmsCategoryListQuerySchema,
	cmsTagListQuerySchema,
	tagCreateInputSchema,
	type Category,
	type CategoryCreateInput,
	type CmsCategoryListQuery,
	type CmsTagListQuery,
	type Tag,
	type TagCreateInput,
} from "../../../shared/contracts/catalog";
import { Button } from "../../components/button";
import { DataTable } from "../../components/data-table";
import { Field } from "../../components/field";
import { ApiClientError } from "../../lib/api-client";
import { readListState, writeListState, type ListState } from "./list-state";
import { useCategories, useCreateCategory, useCreateTag, useTags, useUpdateCategory, useUpdateTag } from "./catalog-api";

type TaxonomyEntity = Category | Tag;
type FormErrors = Record<string, string>;
type TaxonomyKind = "category" | "tag";

const formatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function inputFrom(entity: TaxonomyEntity, kind: TaxonomyKind): CategoryCreateInput | TagCreateInput {
	return kind === "category"
		? { name: entity.name, slug: entity.slug, description: (entity as Category).description, active: entity.active }
		: { name: entity.name, slug: entity.slug, active: entity.active };
}

function emptyInput(kind: TaxonomyKind): CategoryCreateInput | TagCreateInput {
	return kind === "category"
		? { name: "", slug: "", description: null, active: true }
		: { name: "", slug: "", active: true };
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

function queryFromState(kind: TaxonomyKind, state: ListState): CmsCategoryListQuery | CmsTagListQuery {
	const value = {
		page: state.page,
		pageSize: state.pageSize,
		search: state.q,
		sortBy: state.sort ?? "updatedAt",
		sortDirection: state.sort ? state.direction : "desc",
	};
	return kind === "category" ? cmsCategoryListQuerySchema.parse(value) : cmsTagListQuerySchema.parse(value);
}

function TaxonomyForm({ entity, kind, onCancel }: { entity: TaxonomyEntity | null; kind: TaxonomyKind; onCancel: () => void }) {
	const creating = entity === null;
	const [input, setInput] = useState(() => entity ? inputFrom(entity, kind) : emptyInput(kind));
	const [errors, setErrors] = useState<FormErrors>({});
	const [notice, setNotice] = useState<string | null>(null);
	const createCategory = useCreateCategory();
	const updateCategory = useUpdateCategory();
	const createTag = useCreateTag();
	const updateTag = useUpdateTag();
	const pending = createCategory.isPending || updateCategory.isPending || createTag.isPending || updateTag.isPending;
	const entityName = kind === "category" ? "category" : "tag";

	const update = <K extends keyof typeof input>(key: K, value: (typeof input)[K]) => {
		setInput((current) => ({ ...current, [key]: value }) as typeof current);
		setErrors((current) => {
			const next = { ...current };
			delete next[String(key)];
			return next;
		});
		setNotice(null);
	};

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const schema = kind === "category" ? categoryCreateInputSchema : tagCreateInputSchema;
		const parsed = schema.safeParse(input);
		if (!parsed.success) {
			setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
			setNotice("Please correct the highlighted fields.");
			return;
		}
		setErrors({});
		setNotice(null);
		try {
			if (kind === "category") {
				if (entity) await updateCategory.mutateAsync({ id: entity.id, input: parsed.data as CategoryCreateInput });
				else await createCategory.mutateAsync(parsed.data as CategoryCreateInput);
			} else if (entity) await updateTag.mutateAsync({ id: entity.id, input: parsed.data as TagCreateInput });
			else await createTag.mutateAsync(parsed.data as TagCreateInput);
			onCancel();
		} catch (error) {
			setErrors(errorsFor(error));
			setNotice(error instanceof Error ? error.message : `We could not save this ${entityName}.`);
		}
	};

	return <section aria-label={`${creating ? "Create" : "Edit"} ${entityName}`} className="rounded-card border border-white/70 bg-surface p-5 shadow-float sm:p-7">
		<div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
			<div><p className="text-xs font-black uppercase tracking-[0.16em] text-action">Taxonomy record</p><h2 className="mt-1 text-xl font-black tracking-tight">{creating ? `New ${entityName}` : `Edit ${entityName}`}</h2></div>
			<Button onClick={onCancel} type="button" variant="quiet">Cancel</Button>
		</div>
		<form className="mt-5 grid gap-4 sm:grid-cols-2" noValidate onSubmit={(event) => void submit(event)}>
			<Field autoFocus error={errors.name} label="Name" onChange={(event) => update("name", event.target.value)} value={input.name} />
			<Field error={errors.slug} label="Slug" onChange={(event) => update("slug", event.target.value)} value={input.slug} />
			{kind === "category" ? <label className="grid gap-1.5 text-sm font-bold sm:col-span-2" htmlFor="taxonomy-description">Description<textarea aria-describedby={errors.description ? "taxonomy-description-error" : undefined} aria-invalid={Boolean(errors.description)} className={`min-h-24 resize-y rounded-2xl border bg-surface px-4 py-3 font-normal outline-none focus:border-action ${errors.description ? "border-action" : "border-line"}`} id="taxonomy-description" onChange={(event) => update("description" as never, (event.target.value || null) as never)} value={(input as CategoryCreateInput).description ?? ""} />{errors.description ? <span className="font-normal text-[#ae3f27]" id="taxonomy-description-error">{errors.description}</span> : null}</label> : null}
			<label className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 text-sm font-bold sm:col-span-2"><input checked={input.active} className="size-5 accent-action" onChange={(event) => update("active", event.target.checked)} type="checkbox" />Active — show this {entityName} in the CMS</label>
			{notice ? <p aria-live="assertive" className="text-sm font-bold text-[#ae3f27] sm:col-span-2">{errors[""] ?? notice}</p> : null}
			<div className="flex gap-3 sm:col-span-2"><Button disabled={pending} type="submit">{pending ? "Saving…" : creating ? `Create ${entityName}` : `Save ${entityName}`}</Button><Button disabled={pending} onClick={onCancel} type="button" variant="secondary">Cancel</Button></div>
		</form>
	</section>;
}

function TaxonomyPage({ kind }: { kind: TaxonomyKind }) {
	const [params, setParams] = useSearchParams();
	const state = useMemo(() => readListState(params), [params]);
	const query = useMemo(() => queryFromState(kind, state), [kind, state]);
	const categories = useCategories(kind === "category" ? query as CmsCategoryListQuery : cmsCategoryListQuerySchema.parse({}), kind === "category");
	const tags = useTags(kind === "tag" ? query as CmsTagListQuery : cmsTagListQuerySchema.parse({}), kind === "tag");
	const result = kind === "category" ? categories : tags;
	const [editing, setEditing] = useState<TaxonomyEntity | null | undefined>(undefined);
	const title = kind === "category" ? "Categories" : "Tags";
	const singular = kind === "category" ? "category" : "tag";

	const updateState = (next: ListState) => setParams(writeListState(next));
	const sorting: SortingState = state.sort ? [{ id: state.sort, desc: state.direction === "desc" }] : [];
	const columns = useMemo<ColumnDef<TaxonomyEntity, unknown>[]>(() => [
		{ accessorKey: "name", header: "Name", enableSorting: true, cell: ({ row }) => <span className="font-black">{row.original.name}</span> },
		{ accessorKey: "slug", header: "Slug", enableSorting: true, cell: ({ row }) => <code className="text-xs text-muted">{row.original.slug}</code> },
		{ accessorKey: "active", header: "Status", enableSorting: true, cell: ({ row }) => <span className={`rounded-full px-3 py-1 text-xs font-black ${row.original.active ? "bg-[#e7f5df] text-[#28633e]" : "bg-[#fff0ea] text-[#8e301d]"}`}>{row.original.active ? "Active" : "Inactive"}</span> },
		{ accessorKey: "productCount", header: "Usage", cell: ({ row }) => `${row.original.productCount} product${row.original.productCount === 1 ? "" : "s"}` },
		{ accessorKey: "updatedAt", header: "Updated", enableSorting: true, cell: ({ row }) => formatter.format(row.original.updatedAt) },
		{ id: "actions", header: "", cell: ({ row }) => <Button className="min-h-9 px-3 text-xs" onClick={() => setEditing(row.original)} type="button" variant="secondary">Edit</Button> },
	], []);

	const search = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = new FormData(event.currentTarget).get("search");
		updateState({ ...state, page: 1, q: typeof value === "string" ? value : undefined });
	};

	if (result.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-black">{title} could not load.</h1><p className="mt-2 text-sm text-muted">{result.error.message}</p><Button className="mt-5" onClick={() => void result.refetch()} variant="secondary">Retry</Button></section>;

	return <div className="mx-auto max-w-7xl space-y-5">
		<header className="rounded-card bg-ink p-5 text-surface shadow-float sm:flex sm:items-end sm:justify-between sm:p-7"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-action">Catalog taxonomy</p><h1 className="mt-2 text-3xl font-black tracking-tight">{title} keep the shelf intelligible.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-surface/70">Use consistent names and slugs so staff can organize the catalog and customers can find what they need.</p></div><Button className="mt-4 sm:mt-0" onClick={() => setEditing(null)} type="button">New {singular}</Button></header>
		{editing !== undefined ? <TaxonomyForm entity={editing} key={editing?.id ?? "new"} kind={kind} onCancel={() => setEditing(undefined)} /> : null}
		<section className="rounded-card border border-white/70 bg-surface p-5 shadow-float"><form className="flex flex-col gap-3 sm:flex-row" onSubmit={search}><Field defaultValue={state.q} label={`Search ${title.toLowerCase()}`} name="search" placeholder={`Search ${title.toLowerCase()}…`} wrapperClassName="flex-1" /><Button className="sm:self-end" type="submit" variant="secondary">Search</Button></form></section>
		<DataTable columns={columns} data={result.data?.items ?? []} emptyMessage={`No ${title.toLowerCase()} match this view.`} isLoading={result.isPending || result.isFetching} onPageChange={(pageIndex) => updateState({ ...state, page: pageIndex + 1 })} onSortingChange={(next) => {
			const first = next[0];
			updateState({ ...state, page: 1, sort: first?.id, direction: first?.desc ? "desc" : "asc" });
		}} pageIndex={state.page - 1} pageSize={state.pageSize} rowCount={result.data?.totalItems ?? 0} sorting={sorting} />
	</div>;
}

export function CategoriesPage() {
	return <TaxonomyPage kind="category" />;
}

export function TagsPage() {
	return <TaxonomyPage kind="tag" />;
}
