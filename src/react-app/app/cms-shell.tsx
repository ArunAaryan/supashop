import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

import type { CmsRole } from "./session-client";

const cmsLinks = [
	{ label: "Overview", to: "/cms" },
	{ label: "Orders", to: "/cms" },
	{ label: "Inventory", to: "/cms" },
	{ label: "Store settings", to: "/cms/settings/store" },
];

export function CmsShell({ children, role }: PropsWithChildren<{ role: CmsRole }>) {
	if (role === "delivery") {
		return (
			<div className="min-h-screen overflow-x-hidden bg-canvas">
				<nav aria-label="Delivery navigation" className="flex min-h-16 items-center justify-between bg-ink px-4 text-surface sm:px-7">
					<NavLink className="font-black tracking-tight" to="/cms">SUPASHOP · DELIVERY</NavLink>
					<NavLink className="rounded-full bg-action px-4 py-2 text-sm font-bold text-ink" to="/cms">My deliveries</NavLink>
				</nav>
				<main className="mx-auto max-w-3xl p-4 sm:p-7">{children}</main>
			</div>
		);
	}

	return (
		<div className="min-h-screen overflow-x-hidden bg-canvas md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
			<aside className="hidden min-h-screen bg-ink p-4 text-surface md:flex md:flex-col">
				<NavLink className="mb-9 rounded-2xl bg-surface px-4 py-3 text-sm font-black text-ink" to="/cms">SUPASHOP<br /><span className="text-xs font-bold text-muted">operations desk</span></NavLink>
				<nav aria-label="CMS navigation" className="grid gap-2">
					{cmsLinks.map((link) => <NavLink className={({ isActive }) => `min-h-11 rounded-xl px-3 py-3 text-sm font-bold ${isActive ? "bg-action text-ink" : "hover:bg-white/10"}`} key={link.label} to={link.to}>{link.label}</NavLink>)}
				</nav>
				<p className="mt-auto text-xs leading-5 text-surface/60">Signed in as {role}</p>
			</aside>
			<header className="flex min-h-16 items-center justify-between bg-ink px-4 text-surface md:hidden"><span className="font-black">SUPASHOP CMS</span><span className="rounded-full bg-action px-3 py-1 text-xs font-bold text-ink">{role}</span></header>
			<main className="p-4 sm:p-7 lg:p-10">{children}</main>
		</div>
	);
}
