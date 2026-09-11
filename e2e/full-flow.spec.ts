import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { addMilkToCart, checkoutCod, emails, grantRole, seedDatabase, signUp } from "./helpers";

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

test("store owner signs up and reaches the CMS", async () => {
	await signUp(owner, "Store Owner", emails.owner);
	grantRole("owner", emails.owner);
	await owner.goto("/cms/settings/store");
	await expect(owner.getByRole("heading", { name: /store/i }).first()).toBeVisible();
});

test("owner sees the seeded catalog in the CMS", async () => {
	await owner.goto("/cms/categories");
	await expect(owner.getByText("Dairy", { exact: true })).toBeVisible();
	await owner.goto("/cms/offerings");
	await expect(owner.getByRole("link", { name: "MILK-1L" })).toBeVisible();
});

test("customer signs up, browses, and adds milk to the cart", async () => {
	await signUp(customer, "Asha Patel", emails.customer);
	await addMilkToCart(customer);
	await customer.goto("/cart");
	await expect(customer.getByRole("link", { name: /checkout/i })).toBeVisible();
});

test("customer places and cancels their first order", async () => {
	orderA = await checkoutCod(customer);
	await expect(customer.getByRole("heading", { name: orderA })).toBeVisible();
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

test("owner acknowledges and advances the order to out for delivery", async () => {
	await owner.goto(`/cms/orders/${orderB}`);
	await owner.getByLabel("Expected delivery").fill("2026-12-24T10:30");
	await owner.getByRole("button", { name: "Acknowledge" }).click();
	await expect(owner.getByRole("button", { name: "Advance" })).toBeVisible();
	// confirmed -> preparing -> ready -> out_for_delivery
	for (let step = 0; step < 3; step += 1) {
		await owner.getByRole("button", { name: "Advance" }).click();
		if (step < 2) await expect(owner.getByRole("button", { name: "Advance" })).toBeVisible();
	}
	await expect(owner.getByRole("button", { name: "Advance" })).toHaveCount(0);
	await expect(owner.getByRole("button", { name: "Reject order" })).toBeVisible();
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

test("customer can reorder a delivered order", async () => {
	await customer.goto(`/orders/${orderB}`);
	await customer.getByRole("button", { name: /reorder available items/i }).click();
	await expect(customer.getByText(/added to your cart/i)).toBeVisible();
});
