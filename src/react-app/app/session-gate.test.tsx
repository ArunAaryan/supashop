import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CmsGate, LoginGate, SessionGate } from "./session-gate";

type SessionBody = { user: { id: string } | null; cmsRole: string | null };

function renderRoutes(element: ReactNode, initialPath = "/") {
	return render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<MemoryRouter initialEntries={[initialPath]}>
				<Routes>
					<Route path="/" element={element} />
					<Route path="/login" element={<p>Login destination</p>} />
					<Route path="/shop" element={<p>Shop destination</p>} />
					<Route path="/cms" element={<p>CMS destination</p>} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

function mockSession(session: SessionBody) {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(session), { status: 200 })));
}

describe("session routing", () => {
	it("routes a CMS session to the CMS", async () => {
		mockSession({ user: { id: "staff" }, cmsRole: "owner" });
		renderRoutes(<SessionGate />);
		expect(await screen.findByText("CMS destination")).toBeInTheDocument();
	});

	it("routes a registered customer to the shop", async () => {
		mockSession({ user: { id: "customer" }, cmsRole: null });
		renderRoutes(<SessionGate />);
		expect(await screen.findByText("Shop destination")).toBeInTheDocument();
	});

	it("routes an anonymous browser to login", async () => {
		mockSession({ user: null, cmsRole: null });
		renderRoutes(<SessionGate />);
		expect(await screen.findByText("Login destination")).toBeInTheDocument();
	});
});

describe("CMS guard", () => {
	it("sends anonymous users to login", async () => {
		mockSession({ user: null, cmsRole: null });
		renderRoutes(<CmsGate><p>CMS destination</p></CmsGate>);
		expect(await screen.findByText("Login destination")).toBeInTheDocument();
	});

	it("shows an explicit phase message for a non-CMS user", async () => {
		mockSession({ user: { id: "customer" }, cmsRole: null });
		renderRoutes(<CmsGate><p>CMS destination</p></CmsGate>);
		expect(await screen.findByText(/CMS access is required/i)).toBeInTheDocument();
	});
});

describe("login gate", () => {
	it("routes an already authenticated customer away from login", async () => {
		mockSession({ user: { id: "customer" }, cmsRole: null });
		render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<MemoryRouter initialEntries={["/login"]}>
					<Routes>
						<Route path="/login" element={<LoginGate><p>Login form</p></LoginGate>} />
						<Route path="/shop" element={<p>Shop destination</p>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		);
		expect(await screen.findByText("Shop destination")).toBeInTheDocument();
	});

	it("routes an already authenticated CMS user away from login", async () => {
		mockSession({ user: { id: "staff" }, cmsRole: "owner" });
		render(
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<MemoryRouter initialEntries={["/login"]}>
					<Routes>
						<Route path="/login" element={<LoginGate><p>Login form</p></LoginGate>} />
						<Route path="/cms" element={<p>CMS destination</p>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		);
		expect(await screen.findByText("CMS destination")).toBeInTheDocument();
	});
});
