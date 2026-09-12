import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = Date.now().toString(36);

export const emails = {
	owner: `owner.${runId}@supashop.test`,
	delivery: `delivery.${runId}@supashop.test`,
	customer: `customer.${runId}@supashop.test`,
};

const password = "e2e-password-123";

function d1(command: string) {
	return execSync(`pnpm exec wrangler d1 execute supashop-db --local --command "${command}"`, {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
}

export function seedDatabase() {
	execSync("pnpm db:migrate:local", { cwd: projectRoot, stdio: "inherit" });
	execSync(`pnpm exec wrangler d1 execute supashop-db --local --file ${path.join(projectRoot, "e2e", "seed.sql")}`, {
		cwd: projectRoot,
		stdio: "inherit",
	});
}

export function grantRole(role: "owner" | "delivery", email: string) {
	d1(
		`INSERT INTO cms_role (id, user_id, role, active, created_at, updated_at) ` +
		`SELECT '${role}:' || id, id, '${role}', 1, CAST(unixepoch('subsecond') * 1000 AS INTEGER), CAST(unixepoch('subsecond') * 1000 AS INTEGER) ` +
		`FROM user WHERE email = '${email}' ` +
		`AND NOT EXISTS (SELECT 1 FROM cms_role r WHERE r.user_id = user.id AND r.role = '${role}')`,
	);
}

export async function signUp(page: Page, name: string, email: string) {
	await page.goto("/login");
	await page.getByRole("button", { name: "Create account", exact: true }).click();
	await page.getByLabel("Name").fill(name);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: "Create account", exact: true }).click();
	await expect(page).not.toHaveURL(/\/login/);
}

export async function addMilkToCart(page: Page) {
	await page.goto("/products/whole-milk");
	await page.getByRole("button", { name: "Add to cart" }).click();
	await expect(page.getByRole("button", { name: "Add to cart" })).toBeEnabled();
}

export async function addProductToCart(page: Page, slug: string) {
	await page.goto(`/products/${slug}`);
	await page.getByRole("button", { name: "Add to cart" }).click();
	await expect(page.getByRole("button", { name: "Add to cart" })).toBeEnabled();
}

export async function checkoutCod(page: Page, saveAddress = false) {
	await page.goto("/checkout");
	await page.getByLabel("Recipient name").fill("Asha Patel");
	await page.getByLabel("Mobile number").fill("+919876543210");
	await page.getByLabel("Address line 1").fill("12 Market Road");
	await page.getByLabel("City").fill("Bengaluru");
	await page.getByLabel("State").fill("Karnataka");
	await page.getByLabel("Postal code").fill("560001");
	if (saveAddress) await page.getByRole("checkbox", { name: "Save this address to my account" }).check();
	await page.getByRole("button", { name: "Place COD order" }).click();
	await page.waitForURL(/\/orders\//);
	return page.url().split("/orders/")[1] as string;
}
