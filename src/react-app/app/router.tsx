/* eslint-disable react-refresh/only-export-components -- The router deliberately composes route-only components. */
import { createBrowserRouter, Navigate, Outlet, useParams } from "react-router-dom";

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
import { CartPage } from "../features/cart/cart-page";
import { CheckoutPage } from "../features/checkout/checkout-page";
import { AccountPage } from "../features/orders/account-page";
import { CmsOrderDetail } from "../features/orders/cms-order-detail";
import { CmsOrdersPage } from "../features/orders/cms-orders-page";
import { DeliveryOrdersPage } from "../features/orders/delivery-orders";
import { OrderDetailPage } from "../features/orders/order-detail-page";
import { OrdersPage } from "../features/orders/orders-page";
import { ShopHomePage } from "../features/shop/shop-home-page";
import { ShopProductPage } from "../features/shop/shop-product-page";
import { ShopSearchPage } from "../features/shop/shop-search-page";
import { DashboardPage } from "../features/analytics/dashboard-page";
import { guestSessionResponseSchema } from "../../shared/contracts/guest";

function CmsHome() {
	const { data } = useSession();
	return data?.cmsRole === "delivery" ? <Navigate replace to="/cms/deliver" /> : <DashboardPage />;
}

function CustomerArea() {
	return <CustomerShell><Outlet /></CustomerShell>;
}

function ShopProductRoute() {
	const { slug } = useParams();
	return slug ? <ShopProductPage slug={slug} /> : <Navigate replace to="/shop" />;
}

function OrderDetailRoute() {
	const { orderNumber } = useParams();
	return orderNumber ? <OrderDetailPage orderNumber={orderNumber} /> : <Navigate replace to="/orders" />;
}

function CmsOrderDetailRoute() {
	const { orderNumber } = useParams();
	return orderNumber ? <CmsOrderDetail orderNumber={orderNumber} /> : <Navigate replace to="/cms/orders" />;
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
			{ path: "/shop", element: <ShopHomePage /> },
			{ path: "/search", element: <ShopSearchPage /> },
			{ path: "/products/:slug", element: <ShopProductRoute /> },
			{ path: "/cart", element: <CartPage /> },
			{ path: "/checkout", element: <CheckoutPage /> },
			{ path: "/orders", element: <OrdersPage /> },
			{ path: "/orders/:orderNumber", element: <OrderDetailRoute /> },
			{ path: "/account", element: <AccountPage /> },
		],
	},
	{
		element: <CmsArea />,
		children: [
			{ path: "/cms", element: <CmsHome /> },
			{ path: "/cms/products", element: <ProductsPage /> },
			{ path: "/cms/products/new", element: <ProductForm mode="create" /> },
			{ path: "/cms/products/:productId", element: <ProductForm mode="edit" /> },
			{ path: "/cms/categories", element: <CategoriesPage /> },
			{ path: "/cms/tags", element: <TagsPage /> },
			{ path: "/cms/offerings", element: <OfferingsPage /> },
			{ path: "/cms/offerings/new", element: <OfferingForm mode="create" /> },
			{ path: "/cms/offerings/:offeringId", element: <OfferingForm mode="edit" /> },
			{ path: "/cms/orders", element: <CmsOrdersPage /> },
			{ path: "/cms/orders/:orderNumber", element: <CmsOrderDetailRoute /> },
			{ path: "/cms/deliver", element: <DeliveryOrdersPage /> },
			{ path: "/cms/inventory", element: <InventoryMovementsPage /> },
			{ path: "/cms/settings/store", element: <StoreSettingsGate><StoreSettingsPage /></StoreSettingsGate> },
		],
	},
	{ path: "*", element: <Navigate replace to="/" /> },
]);
