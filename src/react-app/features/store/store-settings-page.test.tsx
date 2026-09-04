import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StoreSettingsPage } from "./store-settings-page";

const configuredStore = {
	version: 7,
	configured: true as const,
	ownerUserId: "owner-1",
	name: "SupaShop Market",
	description: "Fresh groceries delivered today.",
	contactName: "Asha Patel",
	phone: "+919876543210",
	email: "hello@supashop.example",
	addressLine1: "42 Market Road",
	addressLine2: "Unit 3",
	landmark: "Near the clock tower",
	city: "Bengaluru",
	state: "Karnataka",
	postalCode: "560001",
	directionsUrl: "https://maps.example.com/supashop",
	deliveryInstructions: "Ring the bell once.",
	latitude: 12.9716,
	longitude: 77.5946,
	timezone: "Asia/Kolkata",
	orderCutoffMinutes: 45,
	hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensMinute: 540, closesMinute: 1260, closed: false })),
	serviceablePostalCodes: ["560001", "560002"],
	closures: [],
};

function renderPage() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return {
		client,
		...render(
			<QueryClientProvider client={client}>
				<StoreSettingsPage />
			</QueryClientProvider>,
		),
	};
}

afterEach(() => vi.unstubAllGlobals());

describe("StoreSettingsPage", () => {
	it("shows a retryable fetch error", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Try again" } }), { status: 500 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(configuredStore)));
		vi.stubGlobal("fetch", fetchMock);
		renderPage();

		expect(await screen.findByText(/could not load/i)).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /retry/i }));
		expect(await screen.findByDisplayValue("SupaShop Market")).toBeInTheDocument();
	});

	it("renders every editable store field and saves with the fetched version", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(configuredStore)))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ...configuredStore, version: 8, name: "SupaShop Express" })));
		vi.stubGlobal("fetch", fetchMock);
		const { client } = renderPage();

		await screen.findByDisplayValue("SupaShop Market");
		for (const label of [
			/store name/i, /customer-facing description/i, /contact person/i, /mobile number/i, /email/i,
			/address line 1/i, /address line 2/i, /landmark/i, /city/i, /state/i, /^postal code$/i,
			/directions url/i, /latitude/i, /longitude/i, /timezone/i, /order cutoff/i,
			/customer-facing delivery instructions/i,
		]) expect(screen.getByLabelText(label)).toBeInTheDocument();
		expect(screen.getAllByRole("checkbox", { name: /closed/i })).toHaveLength(7);
		expect(screen.getAllByLabelText(/opens/i)).toHaveLength(7);
		expect(screen.getAllByLabelText(/closes/i)).toHaveLength(7);
		expect(screen.getByText("560001")).toBeInTheDocument();

		const name = screen.getByLabelText(/store name/i);
		await user.clear(name);
		await user.type(name, "SupaShop Express");
		await user.click(screen.getByRole("button", { name: /save store settings/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock).toHaveBeenLastCalledWith("/api/cms/store", expect.objectContaining({
			method: "PUT",
			body: expect.stringContaining('"version":7'),
		}));
		expect(await screen.findByText(/saved/i)).toBeInTheDocument();
		expect(client.getQueryData(["cms", "store"])).toMatchObject({ version: 8, name: "SupaShop Express" });
	});

	it("renders a first-run draft and maps client validation errors without sending a PUT", async () => {
		const user = userEvent.setup();
		const draft = { ...configuredStore, configured: false as const, ownerUserId: null, version: 1, name: "", contactName: "", phone: "", email: "", addressLine1: "", city: "", state: "", postalCode: "" };
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(draft)));
		vi.stubGlobal("fetch", fetchMock);
		renderPage();

		await screen.findByText(/set up your store/i);
		await user.click(screen.getByRole("button", { name: /save store settings/i }));
		expect(await screen.findByText(/store name is required/i)).toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("puts the indexed postal-code validation message beside the chip entry", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(configuredStore))));
		renderPage();

		await screen.findByDisplayValue("SupaShop Market");
		await user.type(screen.getByLabelText(/add serviceable postal code/i), "!");
		await user.click(screen.getByRole("button", { name: /^add$/i }));
		await user.click(screen.getByRole("button", { name: /save store settings/i }));

		expect(await screen.findByText(/enter a valid postal code/i)).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /remove !/i }));
		expect(screen.queryByText(/enter a valid postal code/i)).not.toBeInTheDocument();
	});

	it("preserves the edited draft when the server reports a conflict", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(configuredStore)))
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "CONFLICT", message: "Store settings changed; reload and retry" } }), { status: 409 }));
		vi.stubGlobal("fetch", fetchMock);
		renderPage();

		const name = await screen.findByLabelText(/store name/i);
		await user.clear(name);
		await user.type(name, "My unsaved name");
		await user.click(screen.getByRole("button", { name: /save store settings/i }));

		expect(await screen.findByText(/reload and retry/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/store name/i)).toHaveValue("My unsaved name");
	});

	it("adds and saves a closure with an editable reason", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(configuredStore)))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ...configuredStore, version: 8, closures: [{ id: "closure-1", startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "Holiday" }] })));
		vi.stubGlobal("fetch", fetchMock);
		renderPage();

		await screen.findByDisplayValue("SupaShop Market");
		await user.click(screen.getByRole("button", { name: /add closure/i }));
		const dates = screen.getAllByLabelText(/starts on|ends on/i) as HTMLInputElement[];
		expect(dates).toHaveLength(2);

		fireEvent.change(screen.getByLabelText(/starts on/i), { target: { value: "2026-12-24" } });
		fireEvent.change(screen.getByLabelText(/ends on/i), { target: { value: "2026-12-26" } });
		await user.type(screen.getByLabelText(/reason/i), "Holiday");

		await user.click(screen.getByRole("button", { name: /save store settings/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock).toHaveBeenLastCalledWith("/api/cms/store", expect.objectContaining({
			method: "PUT",
			body: expect.stringContaining('"startsOn":"2026-12-24"'),
		}));
	});
});
