import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { addMilkToCart, checkoutCod, emails, grantRole, seedDatabase, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

let ownerContext: BrowserContext;
let customerContext: BrowserContext;
let deliveryContext: BrowserContext;
let owner: Page;
let customer: Page;
let delivery: Page;

let orderNumber: string;
let deliveryPin: string;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
	seedDatabase();
	ownerContext = await browser.newContext();
	customerContext = await browser.newContext();
	deliveryContext = await browser.newContext();
	owner = await ownerContext.newPage();
	customer = await customerContext.newPage();
	delivery = await deliveryContext.newPage();
});

test.afterAll(async () => {
	await ownerContext.close();
	await customerContext.close();
	await deliveryContext.close();
});

test("customer places an order for fulfilment", async () => {
	await signUp(customer, "Asha Patel", emails.customer);
	await addMilkToCart(customer);
	orderNumber = await checkoutCod(customer);
	await expect(customer.getByRole("heading", { name: orderNumber })).toBeVisible();
});

test("owner acknowledges and advances the order", async () => {
	await signUp(owner, "Store Owner", emails.owner);
	grantRole("owner", emails.owner);
	await owner.goto(`/cms/orders/${orderNumber}`);
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
	await customer.goto(`/orders/${orderNumber}`);
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
