import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";

import { useCart } from "../features/cart/cart-api";

const customerLinks = [
	{ label: "Shop", to: "/shop", icon: "●" },
	{ label: "Search", to: "/search", icon: "⌕" },
	{ label: "Cart", to: "/cart", icon: "▣" },
	{ label: "Orders", to: "/orders", icon: "◷" },
	{ label: "Account", to: "/account", icon: "☺" },
];

export function CustomerShell({ children }: PropsWithChildren) {
	const cart = useCart();
	const itemCount = cart.data?.itemCount ?? 0;
	const cartLabel = itemCount === 0 ? "Cart, empty" : `Cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}`;
	return (
		<div className="min-h-screen min-w-0 bg-canvas pb-20 md:pb-0">
			<header className="mx-auto flex min-w-0 max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-7">
				<NavLink className="min-w-0 shrink rounded-full bg-ink px-4 py-2 text-sm font-medium tracking-tight text-surface" to="/shop">SUPASHOP</NavLink>
				<div className="flex shrink-0 items-center gap-2"><p className="hidden rounded-full bg-surface px-3 py-2 text-xs font-medium text-muted sm:block">Delivery in 30–45 min</p><NavLink aria-label={cartLabel} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface px-3 text-xs font-medium text-ink shadow-float" to="/cart"><span aria-hidden="true">▣</span><span>{itemCount}</span></NavLink></div>
			</header>
			<main className="mx-auto max-w-6xl px-4 pb-8 sm:px-7">{children}</main>
			<nav aria-label="Customer navigation" className="fixed inset-x-3 bottom-3 z-10 grid min-w-0 grid-cols-5 rounded-card bg-ink p-1.5 text-surface shadow-float md:hidden">
				{customerLinks.map((link) => (
					<NavLink className={({ isActive }) => `grid min-h-12 min-w-0 place-items-center rounded-2xl text-[11px] font-medium ${isActive ? "bg-action text-ink" : "text-surface"}`} key={link.label} to={link.to}>
						<span aria-hidden="true" className="text-base leading-none">{link.icon}</span><span className="max-w-full truncate">{link.label}</span>
					</NavLink>
				))}
			</nav>
		</div>
	);
}
