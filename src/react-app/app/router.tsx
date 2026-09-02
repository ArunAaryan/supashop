/* eslint-disable react-refresh/only-export-components -- The router deliberately composes route-only components. */
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { CmsShell } from "./cms-shell";
import { CustomerShell } from "./customer-shell";
import { CmsGate, LoginGate, SessionGate, StoreSettingsGate } from "./session-gate";
import { useSession } from "./session-client";
import { LoginPage } from "../features/auth/login-page";
import { CategoriesPage, TagsPage } from "../features/catalog/taxonomy-pages";
import { ProductsPage } from "../features/catalog/products-page";
import { ProductForm } from "../features/catalog/product-form";
import { OfferingForm } from "../features/catalog/offering-form";
import { OfferingsPage } from "../features/catalog/offerings-page";
import { InventoryMovementsPage } from "../features/catalog/inventory-pages";
import { StoreSettingsPage } from "../features/store/store-settings-page";
import { guestSessionResponseSchema } from "../../shared/contracts/guest";

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

export async function createGuestSession() {
	const response = await fetch("/api/guest/session", {
		method: "POST",
		credentials: "include",
	});
	if (!response.ok) throw new Error("We could not start a guest session. Please try again.");
	const body: unknown = await response.json().catch(() => null);
	if (!guestSessionResponseSchema.safeParse(body).success) {
		throw new Error("We could not start a guest session. Please try again.");
	}
}

export const router = createBrowserRouter([
	{ path: "/", element: <SessionGate /> },
	{ path: "/login", element: <LoginGate><LoginPage onGuest={createGuestSession} /></LoginGate> },
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
			{ path: "/cms/products", element: <ProductsPage /> },
			{ path: "/cms/products/new", element: <ProductForm mode="create" /> },
			{ path: "/cms/products/:productId", element: <ProductForm mode="edit" /> },
			{ path: "/cms/categories", element: <CategoriesPage /> },
			{ path: "/cms/tags", element: <TagsPage /> },
			{ path: "/cms/offerings", element: <OfferingsPage /> },
			{ path: "/cms/offerings/new", element: <OfferingForm mode="create" /> },
			{ path: "/cms/offerings/:offeringId", element: <OfferingForm mode="edit" /> },
			{ path: "/cms/orders", element: <PhasePage title="Order operations are staged." description="The live order queue will arrive in the next CMS phase." /> },
			{ path: "/cms/inventory", element: <InventoryMovementsPage /> },
			{ path: "/cms/settings/store", element: <StoreSettingsGate><StoreSettingsPage /></StoreSettingsGate> },
		],
	},
	{ path: "*", element: <Navigate replace to="/" /> },
]);
