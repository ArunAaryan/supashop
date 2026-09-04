import { useEffect, useMemo, useState } from "react";

import { storeSettingsSchema, type StoreSettingsInput, type StoreSettingsResponse } from "../../../shared/contracts/store";
import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { ApiClientError } from "../../lib/api-client";
import { useSaveStoreSettings, useStoreSettings } from "./use-store-settings";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Errors = Record<string, string>;

function asInput(settings: StoreSettingsResponse): StoreSettingsInput {
	const input = { ...settings };
	Reflect.deleteProperty(input, "configured");
	Reflect.deleteProperty(input, "ownerUserId");
	return input as StoreSettingsInput;
}

function timeFor(minutes: number) {
	return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function minutesFor(time: string) {
	const [hours, minutes] = time.split(":").map(Number);
	return Number.isInteger(hours) && Number.isInteger(minutes) ? hours * 60 + minutes : 0;
}

function errorsFor(error: unknown): Errors {
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

function TextArea({ label, value, onChange, error, id }: { label: string; value: string; onChange: (value: string) => void; error?: string; id: string }) {
	const errorId = `${id}-error`;
	return <label className="grid gap-1.5 text-sm font-medium text-ink" htmlFor={id}>
		{label}
		<textarea aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} className={`min-h-28 resize-y rounded-2xl border bg-surface px-4 py-3 font-normal outline-none transition placeholder:text-muted/75 focus:border-action motion-reduce:transition-none ${error ? "border-action" : "border-line"}`} id={id} onChange={(event) => onChange(event.target.value)} value={value} />
		{error ? <span className="font-normal text-[#ae3f27]" id={errorId}>{error}</span> : null}
	</label>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
	return <section className="rounded-card border border-white/70 bg-surface p-5 shadow-float sm:p-7">
		<div className="border-b border-line pb-4"><h2 className="text-xl font-medium tracking-tight">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div>
		<div className="mt-5">{children}</div>
	</section>;
}

export function StoreSettingsPage() {
	const store = useStoreSettings();
	const save = useSaveStoreSettings();
	const [form, setForm] = useState<StoreSettingsInput | null>(null);
	const [baseline, setBaseline] = useState<StoreSettingsInput | null>(null);
	const [errors, setErrors] = useState<Errors>({});
	const [notice, setNotice] = useState<string | null>(null);
	const [postalCodeEntry, setPostalCodeEntry] = useState("");

	useEffect(() => {
		if (!store.data || form) return;
		const input = asInput(store.data);
		setForm(input);
		setBaseline(input);
	}, [form, store.data]);

	const dirty = useMemo(() => form !== null && baseline !== null && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);
	const postalCodeErrors = Object.entries(errors).filter(([path]) => path === "serviceablePostalCodes" || path.startsWith("serviceablePostalCodes."));
	const clearErrorPrefix = (prefix: string) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([path]) => path !== prefix && !path.startsWith(`${prefix}.`))));
	const update = <K extends keyof StoreSettingsInput>(key: K, value: StoreSettingsInput[K]) => {
		setForm((current) => current ? { ...current, [key]: value } : current);
		clearErrorPrefix(key);
		setNotice(null);
	};
	const updateHour = (index: number, change: (hour: StoreSettingsInput["hours"][number]) => StoreSettingsInput["hours"][number]) => {
		setForm((current) => current ? { ...current, hours: current.hours.map((hour, hourIndex) => hourIndex === index ? change(hour) : hour) } : current);
		clearErrorPrefix(`hours.${index}`);
		clearErrorPrefix("hours");
		setNotice(null);
	};
	const addPostalCode = () => {
		if (!form) return;
		const code = postalCodeEntry.trim().toUpperCase();
		if (!code) return;
		if (!form.serviceablePostalCodes.includes(code)) update("serviceablePostalCodes", [...form.serviceablePostalCodes, code]);
		setPostalCodeEntry("");
	};
	const updateClosure = (index: number, change: (closure: StoreSettingsInput["closures"][number]) => StoreSettingsInput["closures"][number]) => {
		setForm((current) => current ? { ...current, closures: current.closures.map((closure, closureIndex) => closureIndex === index ? change(closure) : closure) } : current);
		clearErrorPrefix(`closures.${index}`);
		clearErrorPrefix("closures");
		setNotice(null);
	};
	const addClosure = () => {
		if (!form) return;
		update("closures", [...form.closures, { id: crypto.randomUUID(), startsOn: "", endsOn: "", reason: "" }]);
	};
	const removeClosure = (index: number) => {
		if (!form) return;
		update("closures", form.closures.filter((_, closureIndex) => closureIndex !== index));
	};
	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!form) return;
		const parsed = storeSettingsSchema.safeParse(form);
		if (!parsed.success) {
			const nextErrors: Errors = {};
			for (const issue of parsed.error.issues) nextErrors[issue.path.join(".")] ??= issue.message;
			setErrors(nextErrors);
			setNotice("Please correct the highlighted fields.");
			return;
		}
		setErrors({});
		setNotice(null);
		try {
			const saved = await save.mutateAsync(parsed.data);
			const savedInput = asInput(saved);
			setForm(savedInput);
			setBaseline(savedInput);
			setNotice("Store settings saved.");
		} catch (error) {
			setErrors(errorsFor(error));
			setNotice(error instanceof Error ? error.message : "We could not save store settings. Please retry.");
		}
	};

	if (store.isError) return <section className="rounded-card bg-surface p-7 shadow-float"><h1 className="text-2xl font-medium">Store settings could not load.</h1><p className="mt-2 text-sm text-muted">{store.error.message}</p><Button className="mt-5" onClick={() => void store.refetch()} variant="secondary">Retry</Button></section>;
	if (store.isPending || !form) return <section aria-busy="true" className="rounded-card bg-surface p-7 shadow-float"><p className="font-medium">Loading store settings…</p></section>;

	return <form className="mx-auto max-w-6xl space-y-5 pb-28" noValidate onSubmit={submit}>
		<header className="rounded-card bg-ink p-5 text-surface shadow-float sm:flex sm:items-end sm:justify-between sm:p-7">
			<div><p className="text-xs font-medium uppercase tracking-[0.16em] text-action">Store profile</p><h1 className="mt-2 text-3xl font-medium tracking-tight">{store.data.configured ? "Keep your route board current." : "Set up your store."}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-surface/70">These details guide customers, checkout availability, and the delivery team.</p></div>
			<p aria-live="polite" className="mt-4 text-sm font-medium text-surface/80 sm:mt-0">{save.isPending ? "Saving…" : notice === "Store settings saved." ? "Saved" : dirty ? "Unsaved changes" : "Up to date"}</p>
		</header>
		{notice && (Object.keys(errors).length > 0 || save.isError) ? <p aria-live="assertive" className="rounded-2xl border border-[#e6b8b2] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#8e301d]">{errors[""] ?? notice}</p> : null}

		<div className="grid gap-5 xl:grid-cols-2">
			<Section description="The name and person customers see when they need help." title="Identity & contact">
				<div className="grid gap-4 sm:grid-cols-2"><Field error={errors.name} label="Store name" onChange={(event) => update("name", event.target.value)} value={form.name} /><Field error={errors.contactName} label="Contact person" onChange={(event) => update("contactName", event.target.value)} value={form.contactName} wrapperClassName="sm:col-span-2" /><Field error={errors.phone} label="Mobile number" onChange={(event) => update("phone", event.target.value)} value={form.phone} /><Field error={errors.email} label="Email" onChange={(event) => update("email", event.target.value)} type="email" value={form.email} /><div className="sm:col-span-2"><TextArea error={errors.description} id="customer-facing-description" label="Customer-facing description" onChange={(value) => update("description", value)} value={form.description} /></div></div>
			</Section>
			<Section description="A complete written address makes every delivery easier to find." title="Address">
				<div className="grid gap-4 sm:grid-cols-2"><Field error={errors.addressLine1} label="Address line 1" onChange={(event) => update("addressLine1", event.target.value)} value={form.addressLine1} wrapperClassName="sm:col-span-2" /><Field error={errors.addressLine2} label="Address line 2" onChange={(event) => update("addressLine2", event.target.value)} value={form.addressLine2} wrapperClassName="sm:col-span-2" /><Field error={errors.landmark} label="Landmark" onChange={(event) => update("landmark", event.target.value)} value={form.landmark} wrapperClassName="sm:col-span-2" /><Field error={errors.city} label="City" onChange={(event) => update("city", event.target.value)} value={form.city} /><Field error={errors.state} label="State" onChange={(event) => update("state", event.target.value)} value={form.state} /><Field error={errors.postalCode} label="Postal code" onChange={(event) => update("postalCode", event.target.value.toUpperCase())} value={form.postalCode} /></div>
			</Section>
			<Section description="Only add map coordinates when both are known. The directions link must use HTTPS." title="Location & delivery controls">
				<div className="grid gap-4 sm:grid-cols-2"><Field error={errors.latitude} label="Latitude" onChange={(event) => update("latitude", event.target.value === "" ? null : Number(event.target.value))} step="any" type="number" value={form.latitude ?? ""} /><Field error={errors.longitude} label="Longitude" onChange={(event) => update("longitude", event.target.value === "" ? null : Number(event.target.value))} step="any" type="number" value={form.longitude ?? ""} /><Field error={errors.timezone} label="Timezone" onChange={(event) => update("timezone", event.target.value)} value={form.timezone} /><Field error={errors.directionsUrl} label="Directions URL" onChange={(event) => update("directionsUrl", event.target.value || null)} placeholder="https://…" type="url" value={form.directionsUrl ?? ""} /><Field error={errors.orderCutoffMinutes} label="Order cutoff (minutes)" min="0" onChange={(event) => update("orderCutoffMinutes", event.target.value === "" ? null : Number(event.target.value))} type="number" value={form.orderCutoffMinutes ?? ""} /></div>
			</Section>
			<Section description="Enter every postal code you serve. Press Enter or Add to create a chip." title="Serviceable postal codes">
				<div className="flex gap-2"><input aria-label="Add serviceable postal code" className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 outline-none focus:border-action" onChange={(event) => setPostalCodeEntry(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPostalCode(); } }} value={postalCodeEntry} /><Button onClick={addPostalCode} type="button" variant="secondary">Add</Button></div>
				<div aria-label="Serviceable postal codes" className="mt-4 flex flex-wrap gap-2">{form.serviceablePostalCodes.map((code, index) => <span className={`inline-flex min-h-11 items-center gap-2 rounded-full py-1 pl-4 pr-1 text-sm font-medium ${errors[`serviceablePostalCodes.${index}`] ? "bg-[#fff5f4] text-[#8e301d] ring-2 ring-focus" : "bg-action/45"}`} key={`${code}-${index}`}>{code}<button aria-label={`Remove ${code}`} className="grid size-9 place-items-center rounded-full hover:bg-action" onClick={() => update("serviceablePostalCodes", form.serviceablePostalCodes.filter((_, itemIndex) => itemIndex !== index))} type="button">×</button></span>)}</div>
				{postalCodeErrors.map(([path, message]) => <p className="mt-2 text-sm text-[#ae3f27]" id={`${path}-error`} key={path}>{message}</p>)}
			</Section>
		</div>

		<Section description="Keep all seven days visible. Closed days use 00:00 for both times." title="Opening hours">
			<div className="grid gap-3">{errors.hours ? <p className="text-sm text-[#ae3f27]">{errors.hours}</p> : null}{form.hours.map((hour, index) => <div className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[9rem_1fr_1fr_auto] sm:items-end" key={hour.weekday}><p className="pb-3 text-sm font-medium">{weekdays[hour.weekday]}</p><Field disabled={hour.closed} error={errors[`hours.${index}.opensMinute`]} label={`${weekdays[hour.weekday]} opens`} onChange={(event) => updateHour(index, (item) => ({ ...item, opensMinute: minutesFor(event.target.value) }))} type="time" value={timeFor(hour.opensMinute)} /><Field disabled={hour.closed} error={errors[`hours.${index}.closesMinute`]} label={`${weekdays[hour.weekday]} closes`} onChange={(event) => updateHour(index, (item) => ({ ...item, closesMinute: minutesFor(event.target.value) }))} type="time" value={timeFor(hour.closesMinute)} /><label className="flex min-h-12 items-center gap-2 text-sm font-medium"><input aria-label={`${weekdays[hour.weekday]} closed`} checked={hour.closed} className="size-5 accent-action" onChange={(event) => updateHour(index, (item) => ({ ...item, closed: event.target.checked, opensMinute: event.target.checked ? 0 : 540, closesMinute: event.target.checked ? 0 : 1020 }))} type="checkbox" />Closed</label>{errors[`hours.${index}`] ? <p className="text-sm text-[#ae3f27] sm:col-span-4">{errors[`hours.${index}`]}</p> : null}</div>)}</div>
		</Section>
		<Section description="Block delivery and checkout for specific dates (for example public holidays or maintenance)." title="Closures">
			<div className="grid gap-4">{errors.closures ? <p className="text-sm text-[#ae3f27]">{errors.closures}</p> : null}{form.closures.length === 0 ? <p className="text-sm text-muted">No closures planned. Add one below when you need to pause service.</p> : null}{form.closures.map((closure, index) => <div className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" key={closure.id}><Field error={errors[`closures.${index}.startsOn`]} label="Starts on" onChange={(event) => updateClosure(index, (item) => ({ ...item, startsOn: event.target.value }))} type="date" value={closure.startsOn} /><Field error={errors[`closures.${index}.endsOn`]} label="Ends on" onChange={(event) => updateClosure(index, (item) => ({ ...item, endsOn: event.target.value }))} type="date" value={closure.endsOn} /><Field error={errors[`closures.${index}.reason`]} label="Reason" onChange={(event) => updateClosure(index, (item) => ({ ...item, reason: event.target.value }))} placeholder="Optional" value={closure.reason} />{errors[`closures.${index}`] ? <p className="text-sm text-[#ae3f27]">{errors[`closures.${index}`]}</p> : null}<Button className="mb-0.5" onClick={() => removeClosure(index)} type="button" variant="secondary">Remove</Button></div>)}<Button className="justify-self-start" onClick={addClosure} type="button" variant="secondary">Add closure</Button></div>
		</Section>
		<Section description="Customers see this during checkout and in their delivery confirmation." title="Customer instructions"><TextArea error={errors.deliveryInstructions} id="customer-facing-delivery-instructions" label="Customer-facing delivery instructions" onChange={(value) => update("deliveryInstructions", value || null)} value={form.deliveryInstructions ?? ""} /></Section>
		<div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 p-3 backdrop-blur md:left-60"><div className="mx-auto flex max-w-6xl justify-end"><Button disabled={save.isPending} type="submit">{save.isPending ? "Saving…" : "Save store settings"}</Button></div></div>
	</form>;
}
