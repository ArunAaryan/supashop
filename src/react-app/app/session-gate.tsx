import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useSession } from "./session-client";

function SessionLoading() {
	return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-sm font-bold text-ink">Checking your route…</main>;
}

export function SessionGate() {
	const { data, isPending } = useSession();
	if (isPending) return <SessionLoading />;
	if (data?.cmsRole) return <Navigate replace to="/cms" />;
	if (data?.user) return <Navigate replace to="/shop" />;
	return <Navigate replace to="/login" />;
}

export function CmsGate({ children }: PropsWithChildren) {
	const { data, isPending } = useSession();
	if (isPending) return <SessionLoading />;
	if (!data?.user) return <Navigate replace to="/login" />;
	if (!data.cmsRole) {
		return (
			<main className="grid min-h-screen place-items-center bg-canvas p-6">
				<section className="max-w-md rounded-card bg-surface p-7 text-center shadow-float">
					<p className="text-sm font-bold uppercase tracking-widest text-action">Access restricted</p>
					<h1 className="mt-3 text-2xl font-black">CMS access is required.</h1>
					<p className="mt-2 text-sm leading-6 text-muted">This delivery console is reserved for the store team.</p>
				</section>
			</main>
		);
	}
	return <>{children}</>;
}
