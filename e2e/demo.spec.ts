import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { addMilkToCart, addProductToCart, checkoutCod, emails, grantRole, seedDatabase, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

let ownerContext: BrowserContext;
let deliveryContext: BrowserContext;
let customerContext: BrowserContext;
let owner: Page;
let delivery: Page;
let customer: Page;

let orderA: string;
let orderB: string;
let deliveryPin: string;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
	seedDatabase();
	ownerContext = await browser.newContext();
	deliveryContext = await browser.newContext();
	customerContext = await browser.newContext();
	owner = await ownerContext.newPage();
	delivery = await deliveryContext.newPage();
	customer = await customerContext.newPage();
});

test.afterAll(async () => {
	await ownerContext.close();
	await deliveryContext.close();
	await customerContext.close();
});

// ── Phase 1 · Authentication + store profile ────────────────────────────────

test("owner signs up and edits the store profile", async () => {
	await signUp(owner, "Store Owner", emails.owner);
	grantRole("owner", emails.owner);
	await owner.goto("/cms/settings/store");
	await expect(owner.getByLabel("Store name")).toBeVisible();
	await owner.getByLabel("Store name").fill("SupaShop Market (Demo)");
	await owner.getByRole("button", { name: "Save store settings" }).click();
	await expect(owner.getByLabel("Store name")).toHaveValue("SupaShop Market (Demo)");
});

// ── Phase 2 · Catalog authoring ─────────────────────────────────────────────

test("owner creates a category", async () => {
	await owner.goto("/cms/categories");
	await owner.getByRole("button", { name: "New category" }).click();
	await owner.getByLabel("Name", { exact: true }).fill("Snacks");
	await owner.getByLabel("Slug", { exact: true }).fill("snacks");
	await owner.getByLabel("Description").fill("Quick bites");
	await owner.getByRole("button", { name: "Create category" }).click();
	await expect(owner.getByText("Snacks", { exact: true }).first()).toBeVisible();
});

test("owner creates a product", async () => {
	await owner.goto("/cms/products/new");
	await owner.getByLabel("Product code").fill("PANEER-1");
	await owner.getByLabel("Slug").fill("paneer");
	await owner.getByLabel("Product name").fill("Paneer");
	await owner.getByLabel("Description").fill("Soft fresh paneer");
	await owner.getByLabel("Category").selectOption({ label: "Snacks" });
	await owner.getByRole("button", { name: "Save product" }).click();
	await expect(owner.getByText("Product saved.")).toBeVisible();
});

test("owner creates an offering", async () => {
	await owner.goto("/cms/offerings/new");
	await owner.getByLabel("Product").selectOption({ label: "Paneer" });
	await owner.getByLabel("SKU").fill("PANEER-200G");
	await owner.getByLabel("Pack label").fill("200g block");
	await owner.getByLabel("Pack quantity").fill("1");
	await owner.getByLabel("List price (minor units)").fill("2000");
	await owner.getByLabel("Low stock threshold").fill("2");
	await owner.getByRole("checkbox", { name: "Active" }).check();
	await owner.getByRole("button", { name: "Save offering" }).click();
	await owner.goto("/cms/offerings");
	await expect(owner.getByRole("link", { name: "PANEER-200G" })).toBeVisible();
});

test("owner views the inventory ledger", async () => {
	await owner.goto("/cms/inventory");
	await expect(owner.getByRole("heading", { name: /every stock change has a trace/i })).toBeVisible();
});

// ── Phase 3 · Guest storefront, search, cart merge ──────────────────────────

test("guest continues, searches, and browses the storefront", async () => {
	await customer.goto("/login");
	await customer.getByRole("button", { name: "Continue as guest" }).click();
	await expect(customer).toHaveURL(/\/shop/);
	await customer.goto("/search?q=milk");
	await expect(customer.getByRole("link", { name: "View Whole Milk" })).toBeVisible();
	await customer.goto("/search?q=sourdough");
	await expect(customer.getByRole("link", { name: "View Sourdough Bread" })).toBeVisible();
});

test("guest adds items and merges them into a new account", async () => {
	await addProductToCart(customer, "whole-milk");
	await addProductToCart(customer, "sourdough");
	await customer.goto("/cart");
	await expect(customer.getByText("2 items")).toBeVisible();
	await signUp(customer, "Asha Patel", emails.customer);
	await customer.goto("/cart");
	await expect(customer.getByText("2 items")).toBeVisible();
});

// ── Phase 4 · Checkout, address book, cancellation, reorder ─────────────────

test("customer checks out with a saved address", async () => {
	orderA = await checkoutCod(customer, true);
	await expect(customer.getByRole("heading", { name: orderA })).toBeVisible();
});

test("customer sees the saved address in their account", async () => {
	await customer.goto("/account");
	await expect(customer.getByText("12 Market Road")).toBeVisible();
});

test("customer cancels the first order", async () => {
	await customer.goto(`/orders/${orderA}`);
	await customer.getByRole("button", { name: "Cancel order" }).click();
	await customer.getByRole("textbox", { name: /cancellation reason/i }).fill("Changed my mind");
	await customer.getByRole("button", { name: "Confirm cancellation" }).click();
	await expect(customer.getByText("Cancelled").first()).toBeVisible();
});

test("customer places a second order for fulfilment", async () => {
	await addMilkToCart(customer);
	orderB = await checkoutCod(customer);
	await expect(customer.getByRole("heading", { name: orderB })).toBeVisible();
});

// ── Phase 5 · CMS fulfilment + delivery proof ───────────────────────────────

test("owner acknowledges and advances the order", async () => {
	await owner.goto(`/cms/orders/${orderB}`);
	await owner.getByLabel("Expected delivery").fill("2026-12-24T10:30");
	await owner.getByRole("button", { name: "Acknowledge" }).click();
	await expect(owner.getByRole("button", { name: "Advance" })).toBeVisible();
	for (let step = 0; step < 3; step += 1) {
		await owner.getByRole("button", { name: "Advance" }).click();
		if (step < 2) await expect(owner.getByRole("button", { name: "Advance" })).toBeVisible();
	}
	await expect(owner.getByRole("button", { name: "Advance" })).toHaveCount(0);
});

test("customer sees the delivery QR code and PIN", async () => {
	await customer.goto(`/orders/${orderB}`);
	const pin = customer.locator('[aria-label^="Delivery PIN"]');
	await expect(pin).toBeVisible();
	deliveryPin = ((await pin.textContent()) ?? "").trim();
	expect(deliveryPin).toMatch(/^\d{6}$/);
	await expect(customer.getByAltText("Delivery verification QR code")).toBeVisible();
});

test("delivery partner verifies the drop-off by PIN", async () => {
	await signUp(delivery, "Delivery Partner", emails.delivery);
	grantRole("delivery", emails.delivery);
	await delivery.goto("/cms/deliver");
	await expect(delivery.getByRole("heading", { name: /complete each drop-off/i })).toBeVisible();
	await delivery.getByRole("button", { name: "Complete delivery" }).click();
	await delivery.getByLabel("Delivery PIN").fill(deliveryPin);
	await delivery.getByRole("button", { name: "Confirm delivery" }).click();
	await expect(delivery.getByText(/no deliveries are out for delivery/i)).toBeVisible();
});

test("customer reorders a delivered order", async () => {
	await customer.goto(`/orders/${orderB}`);
	await customer.getByRole("button", { name: /reorder available items/i }).click();
	await expect(customer.getByText(/added to your cart/i)).toBeVisible();
});
