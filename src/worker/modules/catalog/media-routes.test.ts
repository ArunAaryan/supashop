import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { signInAs } from "../../test/catalog-fixtures";
import { MediaService } from "./media-service";

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const jpegBytes = new Uint8Array([255, 216, 255, 0]);
const webpBytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
const avifBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0]);

async function insertProduct(active = true) {
	const auth = await signInAs("operations");
	const now = Date.now();
	const categoryId = crypto.randomUUID();
	const productId = crypto.randomUUID();
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
		).bind(categoryId, `Category ${categoryId}`, `category-${categoryId}`, now, now),
		env.DB.prepare(
			"INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Milk', '', ?, ?, 1, ?, ?)",
		).bind(productId, `P_${productId}`, `milk-${productId}`, categoryId, active ? 1 : 0, now, now),
	]);
	return { ...auth, productId };
}

function imageForm(bytes = pngBytes, name = "../../unsafe name.png", type = "image/png", altText = "Bottle of whole milk") {
	const form = new FormData();
	form.set("altText", altText);
	form.set("image", new File([bytes], name, { type }));
	return form;
}

function upload(productId: string, cookie: string, form = imageForm()) {
	return exports.default.fetch(`http://example.com/api/cms/products/${productId}/images`, {
		method: "POST",
		headers: { cookie },
		body: form,
	});
}

describe("catalog media routes", () => {
	it("requires catalog access for CMS image mutations", async () => {
		const productId = crypto.randomUUID();
		expect((await upload(productId, "")).status).toBe(401);
		const { cookie } = await signInAs("delivery");
		expect((await upload(productId, cookie)).status).toBe(403);
	});

	it("validates the product, alt text, MIME declaration, signature, and size", async () => {
		const { cookie, productId } = await insertProduct();
		expect((await upload(crypto.randomUUID(), cookie)).status).toBe(404);
		expect((await upload(productId, cookie, imageForm(pngBytes, "milk.png", "image/png", ""))).status).toBe(422);
		expect((await upload(productId, cookie, imageForm(pngBytes, "milk.jpg", "image/jpeg"))).status).toBe(422);
		expect((await upload(productId, cookie, imageForm(new Uint8Array([1, 2, 3]), "milk.png", "image/png"))).status).toBe(422);
		expect((await upload(productId, cookie, imageForm(new Uint8Array(5 * 1024 * 1024 + 1), "large.png", "image/png"))).status).toBe(422);
	});

	it("stores detected image metadata in D1 and a generated key in R2", async () => {
		const { cookie, productId } = await insertProduct();
		const response = await upload(productId, cookie);
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			productId,
			mimeType: "image/png",
			byteSize: pngBytes.byteLength,
			altText: "Bottle of whole milk",
			displayOrder: 0,
			url: expect.stringMatching(/^\/api\/catalog\/images\//),
		});
		const objects = (await env.MEDIA.list({ prefix: `products/${productId}/` })).objects;
		expect(objects).toHaveLength(1);
		expect(objects[0]?.key).not.toContain("unsafe name");
	});

	it("accepts each supported image signature", async () => {
		const { cookie, productId } = await insertProduct();
		for (const [bytes, filename, type] of [
			[jpegBytes, "milk.jpg", "image/jpeg"],
			[pngBytes, "milk.png", "image/png"],
			[webpBytes, "milk.webp", "image/webp"],
			[avifBytes, "milk.avif", "image/avif"],
		] as const) {
			expect((await upload(productId, cookie, imageForm(bytes, filename, type))).status).toBe(201);
		}
	});

	it("caps galleries at five images", async () => {
		const { cookie, productId } = await insertProduct();
		for (let number = 0; number < 5; number += 1) {
			expect((await upload(productId, cookie, imageForm(pngBytes, `milk-${number}.png`))).status).toBe(201);
		}
		expect((await upload(productId, cookie, imageForm(pngBytes, "sixth.png"))).status).toBe(409);
	});

	it("streams public images only from active products with safe response headers", async () => {
		const { cookie, productId } = await insertProduct();
		const uploaded = await upload(productId, cookie);
		const image = await uploaded.json() as { id: string };
		const response = await exports.default.fetch(`http://example.com/api/catalog/images/${image.id}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("etag")).toMatch(/^".+"$/);
		expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(pngBytes);
		await env.DB.prepare("UPDATE product SET active = 0 WHERE id = ?").bind(productId).run();
		expect((await exports.default.fetch(`http://example.com/api/catalog/images/${image.id}`)).status).toBe(404);
	});

	it("reorders and removes images while compacting display orders", async () => {
		const { cookie, productId } = await insertProduct();
		const first = await upload(productId, cookie, imageForm(pngBytes, "one.png", "image/png", "One"));
		const second = await upload(productId, cookie, imageForm(jpegBytes, "two.jpg", "image/jpeg", "Two"));
		const firstImage = await first.json() as { id: string };
		const secondImage = await second.json() as { id: string };
		const reordered = await exports.default.fetch(`http://example.com/api/cms/products/${productId}/images/order`, {
			method: "PUT",
			headers: { cookie, "content-type": "application/json" },
			body: JSON.stringify({ imageIds: [secondImage.id, firstImage.id] }),
		});
		expect(reordered.status).toBe(200);
		expect(await reordered.json()).toMatchObject([
			{ id: secondImage.id, displayOrder: 0 },
			{ id: firstImage.id, displayOrder: 1 },
		]);
		expect((await exports.default.fetch(`http://example.com/api/cms/products/${productId}/images/${secondImage.id}`, {
			method: "DELETE",
			headers: { cookie },
		})).status).toBe(204);
		const row = await env.DB.prepare("SELECT display_order FROM product_image WHERE id = ?").bind(firstImage.id).first<{ display_order: number }>();
		expect(row).toEqual({ display_order: 0 });
	});

	it("removes a newly written R2 object when its D1 metadata insert fails", async () => {
		const removedKeys: string[] = [];
		const repository = {
			productExists: async () => true,
			countImages: async () => 0,
			insertImage: async () => {
				throw new Error("forced D1 failure");
			},
		};
		const media = {
			put: async () => null,
			delete: async (key: string) => {
				removedKeys.push(key);
			},
		};
		const service = new MediaService(repository as never, media as never);
		await expect(service.upload(crypto.randomUUID(), crypto.randomUUID(), imageForm())).rejects.toThrow("forced D1 failure");
		expect(removedKeys).toHaveLength(1);
		expect(removedKeys[0]).toMatch(/^products\/.+\/.+\.png$/);
	});
});
