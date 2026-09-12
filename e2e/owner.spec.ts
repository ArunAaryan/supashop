import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { emails, grantRole, seedDatabase, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
	seedDatabase();
	context = await browser.newContext();
	page = await context.newPage();
});

test.afterAll(async () => {
	await context.close();
});

test("owner signs up and edits the store profile", async () => {
	await signUp(page, "Store Owner", emails.owner);
	grantRole("owner", emails.owner);
	await page.goto("/cms/settings/store");
	await expect(page.getByLabel("Store name")).toBeVisible();
	await page.getByLabel("Store name").fill("SupaShop Market (Demo)");
	await page.getByRole("button", { name: "Save store settings" }).click();
	await expect(page.getByLabel("Store name")).toHaveValue("SupaShop Market (Demo)");
});

test("owner creates a category", async () => {
	await page.goto("/cms/categories");
	await page.getByRole("button", { name: "New category" }).click();
	await page.getByLabel("Name", { exact: true }).fill("Snacks");
	await page.getByLabel("Slug", { exact: true }).fill("snacks");
	await page.getByLabel("Description").fill("Quick bites");
	await page.getByRole("button", { name: "Create category" }).click();
	await expect(page.getByText("Snacks", { exact: true }).first()).toBeVisible();
});

test("owner creates a product", async () => {
	await page.goto("/cms/products/new");
	await page.getByLabel("Product code").fill("PANEER-1");
	await page.getByLabel("Slug").fill("paneer");
	await page.getByLabel("Product name").fill("Paneer");
	await page.getByLabel("Description").fill("Soft fresh paneer");
	await page.getByLabel("Category").selectOption({ label: "Snacks" });
	await page.getByRole("button", { name: "Save product" }).click();
	await expect(page.getByText("Product saved.")).toBeVisible();
});

test("owner creates an offering", async () => {
	await page.goto("/cms/offerings/new");
	await page.getByLabel("Product").selectOption({ label: "Paneer" });
	await page.getByLabel("SKU").fill("PANEER-200G");
	await page.getByLabel("Pack label").fill("200g block");
	await page.getByLabel("Pack quantity").fill("1");
	await page.getByLabel("List price (minor units)").fill("2000");
	await page.getByLabel("Low stock threshold").fill("2");
	await page.getByRole("checkbox", { name: "Active" }).check();
	await page.getByRole("button", { name: "Save offering" }).click();
	await page.goto("/cms/offerings");
	await expect(page.getByRole("link", { name: "PANEER-200G" })).toBeVisible();
});

test("owner views the inventory ledger", async () => {
	await page.goto("/cms/inventory");
	await expect(page.getByRole("heading", { name: /every stock change has a trace/i })).toBeVisible();
});
