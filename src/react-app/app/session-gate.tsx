import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useSession } from "./session-client";

function SessionLoading() {
	return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-sm font-medium text-ink">Checking your route…</main>;
}

export function SessionGate() {
	const { data, isPending } = useSession();
	if (isPending) return <SessionLoading />;
	if (data?.cmsRole) return <Navigate replace to="/cms" />;
	if (data?.user) return <Navigate replace to="/shop" />;
	if (data?.guest) return <Navigate replace to="/shop" />;
	return <Navigate replace to="/login" />;
}

export function LoginGate({ children }: PropsWithChildren) {
	const { data, isPending } = useSession();
	if (isPending) return <SessionLoading />;
	if (data?.cmsRole) return <Navigate replace to="/cms" />;
	if (data?.user) return <Navigate replace to="/shop" />;
	if (data?.guest) return <Navigate replace to="/shop" />;
	return <>{children}</>;
}

export function CmsGate({ children }: PropsWithChildren) {
	const { data, isPending } = useSession();
	if (isPending) return <SessionLoading />;
	if (!data?.user) return <Navigate replace to="/login" />;
	if (!data.cmsRole) {
		return (
			<main className="grid min-h-screen place-items-center bg-canvas p-6">
				<section className="max-w-md rounded-card bg-surface p-7 text-center shadow-float">
					<p className="text-sm font-medium uppercase tracking-widest text-action">Access restricted</p>
					<h1 className="mt-3 text-2xl font-medium">CMS access is required.</h1>
					<p className="mt-2 text-sm leading-6 text-muted">This delivery console is reserved for the store team.</p>
				</section>
			</main>
		);
	}
	return <>{children}</>;
}

export function StoreSettingsGate({ children }: PropsWithChildren) {
	const { data, isPending } = useSession();
	if (isPending) return <SessionLoading />;
	if (!data?.user) return <Navigate replace to="/login" />;
	if (data.cmsRole !== "owner" && data.cmsRole !== "admin") {
		return (
			<section className="rounded-card border border-white/70 bg-surface p-7 shadow-float">
				<p className="text-xs font-medium uppercase tracking-[0.16em] text-action">CMS forbidden</p>
				<h1 className="mt-3 text-2xl font-medium tracking-tight">Store settings are restricted.</h1>
				<p className="mt-2 max-w-lg text-sm leading-6 text-muted">Only store owners and administrators can change the customer-facing store profile.</p>
			</section>
		);
	}
	return <>{children}</>;
}
