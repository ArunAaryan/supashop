/* eslint-disable react-refresh/only-export-components -- The router deliberately composes route-only components. */
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { CmsShell } from "./cms-shell";
import { CustomerShell } from "./customer-shell";
import { CmsGate, SessionGate } from "./session-gate";
import { useSession } from "./session-client";
import { LoginPage } from "../features/auth/login-page";

function PhasePage({ title, description }: { title: string; description: string }) {
	return (
		<section className="rounded-card border border-white/70 bg-surface p-6 shadow-float sm:p-9">
			<p className="text-xs font-black uppercase tracking-[0.16em] text-action">Phase one</p>
			<h1 className="mt-3 text-3xl font-black tracking-tight">{title}</h1>
			<p className="mt-3 max-w-xl text-sm leading-6 text-muted">{description}</p>
		</section>
	);
}

function CustomerArea() {
	return <CustomerShell><Outlet /></CustomerShell>;
}

function CmsArea() {
	const { data } = useSession();
	return <CmsGate><CmsShell role={data?.cmsRole ?? "delivery"}><Outlet /></CmsShell></CmsGate>;
}

function guestEntryUnavailable() {
	return Promise.reject(new Error("Guest checkout will be available in the next delivery phase."));
}

export const router = createBrowserRouter([
	{ path: "/", element: <SessionGate /> },
	{ path: "/login", element: <LoginPage onGuest={guestEntryUnavailable} /> },
	{
		element: <CustomerArea />,
		children: [
			{ path: "/shop", element: <PhasePage title="The shop is warming up." description="Browse, search, and cart tools are scheduled for the next storefront phase." /> },
			{ path: "/account", element: <PhasePage title="Your account is on the route." description="Saved addresses and order history will arrive with the customer account phase." /> },
		],
	},
	{
		element: <CmsArea />,
		children: [
			{ path: "/cms", element: <PhasePage title="Operations dashboard arriving soon." description="Orders, inventory, and daily delivery work will appear here in the next CMS phase." /> },
			{ path: "/cms/settings/store", element: <PhasePage title="Store settings are staged." description="The editable store profile follows in the settings phase." /> },
		],
	},
	{ path: "*", element: <Navigate replace to="/" /> },
]);
