import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

const customerLinks = [
	{ label: "Shop", to: "/shop", icon: "●" },
	{ label: "Search", to: "/shop", icon: "⌕" },
	{ label: "Cart", to: "/shop", icon: "▣" },
	{ label: "Orders", to: "/account", icon: "◷" },
	{ label: "Account", to: "/account", icon: "☺" },
];

export function CustomerShell({ children }: PropsWithChildren) {
	return (
		<div className="min-h-screen overflow-x-hidden bg-canvas pb-20 md:pb-0">
			<header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-7">
				<NavLink className="rounded-full bg-ink px-4 py-2 text-sm font-black tracking-tight text-surface" to="/shop">SUPASHOP</NavLink>
				<p className="rounded-full bg-surface px-3 py-2 text-xs font-bold text-muted">Delivery in 30–45 min</p>
			</header>
			<main className="mx-auto max-w-6xl px-4 pb-8 sm:px-7">{children}</main>
			<nav aria-label="Customer navigation" className="fixed inset-x-3 bottom-3 z-10 grid grid-cols-5 rounded-card bg-ink p-1.5 text-surface shadow-float md:hidden">
				{customerLinks.map((link) => (
					<NavLink className={({ isActive }) => `grid min-h-12 place-items-center rounded-2xl text-[11px] font-bold ${isActive ? "bg-action text-ink" : "text-surface"}`} key={link.label} to={link.to}>
						<span aria-hidden="true" className="text-base leading-none">{link.icon}</span><span>{link.label}</span>
					</NavLink>
				))}
			</nav>
		</div>
	);
}
