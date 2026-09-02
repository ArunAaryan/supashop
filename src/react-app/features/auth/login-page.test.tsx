import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "./login-page";
import { SessionGate } from "../../app/session-gate";

const { signInEmail, signUpEmail } = vi.hoisted(() => ({
	signInEmail: vi.fn(),
	signUpEmail: vi.fn(),
}));

vi.mock("../../lib/auth-client", () => ({
	authClient: {
		signIn: { email: signInEmail },
		signUp: { email: signUpEmail },
	},
}));

function renderPage(onGuest = vi.fn()) {
	return {
		onGuest,
		...render(
			<QueryClientProvider client={new QueryClient()}>
				<MemoryRouter>
					<LoginPage onGuest={onGuest} />
				</MemoryRouter>
			</QueryClientProvider>,
		),
	};
}

describe("LoginPage", () => {
	it("offers email sign-in and guest continuation", () => {
		renderPage();

		expect(screen.getByRole("heading", { name: /welcome/i })).toBeInTheDocument();
		expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /continue as guest/i })).toBeInTheDocument();
	});

	it("allows the login card and brand label to shrink on narrow screens", () => {
		renderPage();

		expect(screen.getByRole("main")).not.toHaveClass("overflow-x-hidden");
		expect(screen.getByRole("heading", { name: /welcome/i }).closest("section")).toHaveClass("min-w-0");
		expect(screen.getByText("SUPASHOP · DELIVERY")).toHaveClass("max-w-full", "whitespace-normal");
	});

	it("registers with email and password after switching modes", async () => {
		const user = userEvent.setup();
		signUpEmail.mockResolvedValueOnce({ data: { user: { id: "new-user" } }, error: null });
		renderPage();

		await user.click(screen.getByRole("button", { name: /create account/i }));
		await user.type(screen.getByLabelText(/name/i), "Asha");
		await user.type(screen.getByLabelText(/email/i), "asha@example.com");
		await user.type(screen.getByLabelText(/^password/i), "correct horse battery staple");
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(signUpEmail).toHaveBeenCalledWith({
			name: "Asha",
			email: "asha@example.com",
			password: "correct horse battery staple",
		});
	});

	it("shows auth errors beside the form", async () => {
		const user = userEvent.setup();
		signInEmail.mockResolvedValueOnce({ data: null, error: { message: "Invalid email or password" } });
		renderPage();

		await user.type(screen.getByLabelText(/email/i), "asha@example.com");
		await user.type(screen.getByLabelText(/^password/i), "incorrect");
		await user.click(screen.getByRole("button", { name: /sign in/i }));

		expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
	});

	it("delegates guest continuation to the injected callback", async () => {
		const user = userEvent.setup();
		const { onGuest } = renderPage();

		await user.click(screen.getByRole("button", { name: /continue as guest/i }));

		expect(onGuest).toHaveBeenCalledOnce();
	});

	it("navigates to the shop after the injected guest session succeeds", async () => {
		const user = userEvent.setup();
		const onGuest = vi.fn().mockResolvedValue(undefined);

		render(
			<QueryClientProvider client={new QueryClient()}>
				<MemoryRouter initialEntries={["/login"]}>
					<Routes>
						<Route path="/login" element={<LoginPage onGuest={onGuest} />} />
						<Route path="/shop" element={<p>Shop destination</p>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await user.click(screen.getByRole("button", { name: /continue as guest/i }));

		expect(await screen.findByText("Shop destination")).toBeInTheDocument();
	});

	it("refreshes a cached anonymous session before routing after successful sign-in", async () => {
		const user = userEvent.setup();
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(["session"], { user: null, session: null, cmsRole: null });
		signInEmail.mockResolvedValueOnce({ data: { user: { id: "customer" } }, error: null });
		const fetchMock = vi.fn((url: string) => {
			if (url === "/api/cart/merge") return Promise.resolve(new Response(JSON.stringify({ lines: [], itemCount: 0, subtotalMinor: 0, requiresReview: false, updatedAt: null })));
			if (url === "/api/session") return Promise.resolve(new Response(JSON.stringify({ user: { id: "customer" }, session: { id: "session", expiresAt: "later" }, cmsRole: null }), { status: 200 }));
			return Promise.reject(new Error(`Unexpected request: ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={["/login"]}>
					<Routes>
						<Route path="/login" element={<LoginPage onGuest={vi.fn()} />} />
						<Route path="/" element={<SessionGate />} />
						<Route path="/shop" element={<p>Shop destination</p>} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		await user.type(screen.getByLabelText(/email/i), "customer@example.com");
		await user.type(screen.getByLabelText(/^password/i), "correct horse battery staple");
		await user.click(screen.getByRole("button", { name: /sign in/i }));

		expect(await screen.findByText("Shop destination")).toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledWith("/api/cart/merge", expect.objectContaining({ method: "POST" }));
		expect(fetch).toHaveBeenCalledWith("/api/session", { credentials: "include" });
	});
});
