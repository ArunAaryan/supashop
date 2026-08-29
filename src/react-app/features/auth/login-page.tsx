import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "../../components/button";
import { Field } from "../../components/field";
import { authClient } from "../../lib/auth-client";
import { getSession } from "../../app/session-client";

type LoginPageProps = {
	onGuest: () => void | Promise<void>;
};

type AuthMode = "sign-in" | "sign-up";

function messageFrom(error: unknown): string {
	if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
		return error.message;
	}
	return "We could not complete that request. Please try again.";
}

export function LoginPage({ onGuest }: LoginPageProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [mode, setMode] = useState<AuthMode>("sign-in");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string>();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isRegistration = mode === "sign-up";

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(undefined);
		setIsSubmitting(true);
		try {
			const result = isRegistration
				? await authClient.signUp.email({ name, email, password })
				: await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(messageFrom(result.error));
				return;
			}
			queryClient.removeQueries({ queryKey: ["session"] });
			await queryClient.fetchQuery({ queryKey: ["session"], queryFn: getSession });
			navigate("/", { replace: true });
		} catch (caughtError) {
			setError(messageFrom(caughtError));
		} finally {
			setIsSubmitting(false);
		}
	}

	async function continueAsGuest() {
		setError(undefined);
		setIsSubmitting(true);
		try {
			await onGuest();
			navigate("/shop", { replace: true });
		} catch (caughtError) {
			setError(messageFrom(caughtError));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<main className="grid min-h-screen w-full min-w-0 place-items-center bg-[radial-gradient(circle_at_10%_10%,#ffece4_0,transparent_30%),radial-gradient(circle_at_90%_90%,#f3a488_0,transparent_35%)] p-4 sm:p-8">
			<section className="w-full min-w-0 max-w-md rounded-card border border-white/65 bg-surface p-6 shadow-float sm:p-9">
				<p className="mb-3 inline-block max-w-full whitespace-normal break-words rounded-full bg-ink px-3 py-1 text-xs font-medium tracking-[0.16em] text-surface">SUPASHOP · DELIVERY</p>
				<h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Welcome back.</h1>
				<p className="mt-2 text-sm leading-6 text-muted">Fresh essentials, on the route to your door.</p>

				<form className="mt-7 grid gap-4" onSubmit={submit}>
					{isRegistration ? <Field autoComplete="name" label="Name" onChange={(event) => setName(event.target.value)} required value={name} /> : null}
					<Field autoComplete="email" label="Email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
					<Field autoComplete={isRegistration ? "new-password" : "current-password"} label="Password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
					{error ? <p aria-live="polite" className="rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm text-[#ae3f27]">{error}</p> : null}
					<Button disabled={isSubmitting} type="submit">{isSubmitting ? "Please wait…" : isRegistration ? "Create account" : "Sign in"}</Button>
				</form>

				<div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.12em] text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
				<Button className="w-full" disabled={isSubmitting} onClick={() => void continueAsGuest()} type="button" variant="secondary">Continue as guest</Button>
				<Button className="mt-4 w-full" onClick={() => { setMode(isRegistration ? "sign-in" : "sign-up"); setError(undefined); }} type="button" variant="quiet">
					{isRegistration ? "Already have an account? Sign in" : "Create account"}
				</Button>
			</section>
		</main>
	);
}
