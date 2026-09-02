import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

import type { CmsRole } from "./session-client";

const cmsLinks = [
	{ label: "Overview", to: "/cms" },
	{ label: "Orders", to: "/cms/orders" },
	{ label: "Products", to: "/cms/products" },
	{ label: "Categories", to: "/cms/categories" },
	{ label: "Tags", to: "/cms/tags" },
	{ label: "Offerings", to: "/cms/offerings" },
	{ label: "Inventory", to: "/cms/inventory" },
	{ label: "Store settings", to: "/cms/settings/store" },
];

export function CmsShell({ children, role }: PropsWithChildren<{ role: CmsRole }>) {
	if (role === "delivery") {
		return (
			<div className="min-h-screen min-w-0 bg-canvas">
				<nav aria-label="Delivery navigation" className="flex min-h-16 min-w-0 items-center justify-between gap-3 bg-ink px-4 text-surface sm:px-7">
					<NavLink className="min-w-0 truncate font-medium tracking-tight" to="/cms">SUPASHOP · DELIVERY</NavLink>
					<NavLink className="shrink-0 rounded-full bg-action px-4 py-2 text-sm font-medium text-ink" to="/cms">My deliveries</NavLink>
				</nav>
				<main className="mx-auto max-w-3xl p-4 sm:p-7">{children}</main>
			</div>
		);
	}

	return (
		<div className="min-h-screen min-w-0 bg-canvas md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
			<aside className="hidden min-h-screen bg-ink p-4 text-surface md:flex md:flex-col">
				<NavLink className="mb-9 rounded-2xl bg-surface px-4 py-3 text-sm font-medium text-ink" to="/cms">SUPASHOP<br /><span className="text-xs font-medium text-muted">operations desk</span></NavLink>
				<nav aria-label="CMS navigation" className="grid gap-2">
					{cmsLinks.map((link) => <NavLink className={({ isActive }) => `min-h-11 rounded-xl px-3 py-3 text-sm font-medium ${isActive ? "bg-action text-ink" : "hover:bg-white/10"}`} end key={link.label} to={link.to}>{link.label}</NavLink>)}
				</nav>
				<p className="mt-auto text-xs leading-5 text-surface/60">Signed in as {role}</p>
			</aside>
			<header className="flex min-h-16 min-w-0 items-center justify-between gap-3 bg-ink px-4 text-surface md:hidden"><span className="min-w-0 truncate font-medium">SUPASHOP CMS</span><span className="shrink-0 rounded-full bg-action px-3 py-1 text-xs font-medium text-ink">{role}</span></header>
			<main className="p-4 sm:p-7 lg:p-10">{children}</main>
		</div>
	);
}
