import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { addMilkToCart, addProductToCart, checkoutCod, emails, seedDatabase, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let orderA: string;
let orderB: string;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
	seedDatabase();
	context = await browser.newContext();
	page = await context.newPage();
});

test.afterAll(async () => {
	await context.close();
});

test("guest continues, searches, and browses the storefront", async () => {
	await page.goto("/login");
	await page.getByRole("button", { name: "Continue as guest" }).click();
	await expect(page).toHaveURL(/\/shop/);
	await page.goto("/search?q=milk");
	await expect(page.getByRole("link", { name: "View Whole Milk" })).toBeVisible();
	await page.goto("/search?q=sourdough");
	await expect(page.getByRole("link", { name: "View Sourdough Bread" })).toBeVisible();
});

test("guest adds items and merges them into a new account", async () => {
	await addProductToCart(page, "whole-milk");
	await addProductToCart(page, "sourdough");
	await page.goto("/cart");
	await expect(page.getByText("2 items")).toBeVisible();
	await signUp(page, "Asha Patel", emails.customer);
	await page.goto("/cart");
	await expect(page.getByText("2 items")).toBeVisible();
});

test("customer checks out with a saved address", async () => {
	orderA = await checkoutCod(page, true);
	await expect(page.getByRole("heading", { name: orderA })).toBeVisible();
});

test("customer sees the saved address in their account", async () => {
	await page.goto("/account");
	await expect(page.getByText("12 Market Road")).toBeVisible();
});

test("customer cancels the first order", async () => {
	await page.goto(`/orders/${orderA}`);
	await page.getByRole("button", { name: "Cancel order" }).click();
	await page.getByRole("textbox", { name: /cancellation reason/i }).fill("Changed my mind");
	await page.getByRole("button", { name: "Confirm cancellation" }).click();
	await expect(page.getByText("Cancelled").first()).toBeVisible();
});

test("customer places a second order", async () => {
	await addMilkToCart(page);
	orderB = await checkoutCod(page);
	await expect(page.getByRole("heading", { name: orderB })).toBeVisible();
});

test("customer reorders an order", async () => {
	await page.goto(`/orders/${orderB}`);
	await page.getByRole("button", { name: /reorder available items/i }).click();
	await expect(page.getByText(/added to your cart/i)).toBeVisible();
});
