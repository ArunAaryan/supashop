export type StoredProductImage = {
	id: string;
	product_id: string;
	object_key: string;
	mime_type: string;
	byte_size: number;
	alt_text: string;
	display_order: number;
	created_at: number;
};

export class MediaRepository {
	constructor(private readonly database: D1Database) {}

	async productExists(id: string): Promise<boolean> {
		return (await this.database.prepare("SELECT id FROM product WHERE id = ?").bind(id).first()) !== null;
	}

	async countImages(productId: string): Promise<number> {
		const row = await this.database.prepare(
			"SELECT count(*) AS total FROM product_image WHERE product_id = ?",
		).bind(productId).first<{ total: number }>();
		return Number(row?.total ?? 0);
	}

	async insertImage(image: Omit<StoredProductImage, "created_at"> & { created_by: string }): Promise<StoredProductImage> {
		const now = Date.now();
		await this.database.prepare(
			"INSERT INTO product_image (id, product_id, object_key, mime_type, byte_size, alt_text, display_order, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).bind(
			image.id,
			image.product_id,
			image.object_key,
			image.mime_type,
			image.byte_size,
			image.alt_text,
			image.display_order,
			image.created_by,
			now,
		).run();
		return (await this.getImage(image.id))!;
	}

	async listImages(productId: string): Promise<StoredProductImage[]> {
		const result = await this.database.prepare(
			"SELECT id, product_id, object_key, mime_type, byte_size, alt_text, display_order, created_at FROM product_image WHERE product_id = ? ORDER BY display_order ASC, id ASC",
		).bind(productId).all<StoredProductImage>();
		return result.results;
	}

	async reorderImages(productId: string, imageIds: string[]): Promise<StoredProductImage[] | null> {
		const images = await this.listImages(productId);
		if (images.length !== imageIds.length || new Set(images.map((image) => image.id)).size !== imageIds.length) {
			return null;
		}
		const requested = new Set(imageIds);
		if (images.some((image) => !requested.has(image.id))) return null;

		await this.database.batch([
			this.database.prepare("UPDATE product_image SET display_order = -display_order - 1 WHERE product_id = ?").bind(productId),
			...imageIds.map((imageId, displayOrder) =>
				this.database.prepare("UPDATE product_image SET display_order = ? WHERE id = ? AND product_id = ?").bind(displayOrder, imageId, productId),
			),
		]);
		return this.listImages(productId);
	}

	async removeImage(productId: string, imageId: string): Promise<StoredProductImage | null> {
		const image = await this.database.prepare(
			"SELECT id, product_id, object_key, mime_type, byte_size, alt_text, display_order, created_at FROM product_image WHERE id = ? AND product_id = ?",
		).bind(imageId, productId).first<StoredProductImage>();
		if (!image) return null;

		await this.database.batch([
			this.database.prepare("DELETE FROM product_image WHERE id = ? AND product_id = ?").bind(imageId, productId),
			this.database.prepare("UPDATE product_image SET display_order = display_order - 1 WHERE product_id = ? AND display_order > ?").bind(productId, image.display_order),
		]);
		return image;
	}

	async getPublicImage(id: string): Promise<StoredProductImage | null> {
		return this.database.prepare(
			"SELECT pi.id, pi.product_id, pi.object_key, pi.mime_type, pi.byte_size, pi.alt_text, pi.display_order, pi.created_at FROM product_image pi INNER JOIN product p ON p.id = pi.product_id WHERE pi.id = ? AND p.active = 1",
		).bind(id).first<StoredProductImage>();
	}

	private async getImage(id: string): Promise<StoredProductImage | null> {
		return this.database.prepare(
			"SELECT id, product_id, object_key, mime_type, byte_size, alt_text, display_order, created_at FROM product_image WHERE id = ?",
		).bind(id).first<StoredProductImage>();
	}
}
