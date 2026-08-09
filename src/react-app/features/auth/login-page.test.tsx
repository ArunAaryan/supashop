import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "./login-page";

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
});
