import type {
	CategoryCreateInput,
	CmsCategoryListQuery,
	CmsProductListQuery,
	CmsTagListQuery,
	ProductCreateInput,
	ProductUpdateInput,
	TagCreateInput,
} from "../../../shared/contracts/catalog";

export type StoredCategory = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	active: number;
	product_count: number;
	created_at: number;
	updated_at: number;
};

export type StoredTag = {
	id: string;
	name: string;
	slug: string;
	active: number;
	product_count: number;
	created_at: number;
	updated_at: number;
};

export type CatalogPage<T> = { items: T[]; totalItems: number };

export type StoredProductImage = {
	id: string;
	product_id: string;
	mime_type: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
	byte_size: number;
	alt_text: string;
	display_order: number;
	created_at: number;
};

export type StoredOffering = {
	id: string;
	product_id: string;
	sku: string;
	label: string;
	pack_quantity: number | null;
	weight_value: number | null;
	weight_unit: "g" | "kg" | "ml" | "l" | null;
	list_price_minor: number;
	discount_type: "none" | "fixed" | "percentage";
	discount_value: number;
	stock_quantity: number;
	low_stock_threshold: number;
	active: number;
	version: number;
	created_at: number;
	updated_at: number;
};

export type StoredProduct = {
	id: string;
	code: string;
	slug: string;
	name: string;
	description: string;
	base_weight_value: number | null;
	base_weight_unit: "g" | "kg" | "ml" | "l" | null;
	category_id: string;
	active: number;
	version: number;
	created_at: number;
	updated_at: number;
	category: StoredCategory;
	primary_image: StoredProductImage | null;
	active_offering_count: number;
	minimum_effective_price_minor: number | null;
	has_promotion: number;
	in_stock: number;
};

export type StoredProductDetail = StoredProduct & {
	tags: StoredTag[];
	images: StoredProductImage[];
	offerings: StoredOffering[];
};

const categorySort = {
	name: "c.name",
	slug: "c.slug",
	active: "c.active",
	updatedAt: "c.updated_at",
} as const;

const tagSort = {
	name: "t.name",
	slug: "t.slug",
	active: "t.active",
	updatedAt: "t.updated_at",
} as const;

const productSort = {
	name: "p.name",
	code: "p.code",
	active: "p.active",
	updatedAt: "p.updated_at",
} as const;

type ProductProjectionRow = {
	id: string;
	code: string;
	slug: string;
	name: string;
	description: string;
	base_weight_value: number | null;
	base_weight_unit: "g" | "kg" | "ml" | "l" | null;
	category_id: string;
	active: number;
	version: number;
	created_at: number;
	updated_at: number;
	category_row_id: string;
	category_name: string;
	category_slug: string;
	category_description: string | null;
	category_active: number;
	category_created_at: number;
	category_updated_at: number;
	category_product_count: number;
	primary_image_id: string | null;
	primary_image_product_id: string | null;
	primary_image_mime_type: StoredProductImage["mime_type"] | null;
	primary_image_byte_size: number | null;
	primary_image_alt_text: string | null;
	primary_image_display_order: number | null;
	primary_image_created_at: number | null;
	active_offering_count: number;
	minimum_effective_price_minor: number | null;
	has_promotion: number;
	in_stock: number;
};

const effectivePriceSql = "o.list_price_minor - CASE o.discount_type WHEN 'fixed' THEN o.discount_value WHEN 'percentage' THEN (o.list_price_minor * o.discount_value / 10000) ELSE 0 END";

const productProjectionSelect = `SELECT p.id, p.code, p.slug, p.name, p.description, p.base_weight_value, p.base_weight_unit, p.category_id, p.active, p.version, p.created_at, p.updated_at,
	c.id AS category_row_id, c.name AS category_name, c.slug AS category_slug, c.description AS category_description, c.active AS category_active, c.created_at AS category_created_at, c.updated_at AS category_updated_at,
	(SELECT count(*) FROM product category_product WHERE category_product.category_id = c.id) AS category_product_count,
	pi.id AS primary_image_id, pi.product_id AS primary_image_product_id, pi.mime_type AS primary_image_mime_type, pi.byte_size AS primary_image_byte_size, pi.alt_text AS primary_image_alt_text, pi.display_order AS primary_image_display_order, pi.created_at AS primary_image_created_at,
	(SELECT count(*) FROM offering o WHERE o.product_id = p.id AND o.active = 1) AS active_offering_count,
	(SELECT min(${effectivePriceSql}) FROM offering o WHERE o.product_id = p.id AND o.active = 1) AS minimum_effective_price_minor,
	EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1 AND o.discount_type != 'none') AS has_promotion,
	EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1 AND o.stock_quantity > 0) AS in_stock`;

const productProjectionFrom = "FROM product p JOIN category c ON c.id = p.category_id LEFT JOIN product_image pi ON pi.product_id = p.id AND pi.display_order = 0";

function productFromProjection(row: ProductProjectionRow): StoredProduct {
	const primaryImage = row.primary_image_id === null ? null : {
		id: row.primary_image_id,
		product_id: row.primary_image_product_id!,
		mime_type: row.primary_image_mime_type!,
		byte_size: row.primary_image_byte_size!,
		alt_text: row.primary_image_alt_text!,
		display_order: row.primary_image_display_order!,
		created_at: row.primary_image_created_at!,
	};
	return {
		id: row.id,
		code: row.code,
		slug: row.slug,
		name: row.name,
		description: row.description,
		base_weight_value: row.base_weight_value,
		base_weight_unit: row.base_weight_unit,
		category_id: row.category_id,
		active: row.active,
		version: row.version,
		created_at: row.created_at,
		updated_at: row.updated_at,
		category: {
			id: row.category_row_id,
			name: row.category_name,
			slug: row.category_slug,
			description: row.category_description,
			active: row.category_active,
			product_count: row.category_product_count,
			created_at: row.category_created_at,
			updated_at: row.category_updated_at,
		},
		primary_image: primaryImage,
		active_offering_count: row.active_offering_count,
		minimum_effective_price_minor: row.minimum_effective_price_minor,
		has_promotion: row.has_promotion,
		in_stock: row.in_stock,
	};
}

function pageOffset(page: number, pageSize: number): number {
	return (page - 1) * pageSize;
}

export class CatalogRepository {
	constructor(private readonly database: D1Database) {}

	async listCategories(query: CmsCategoryListQuery): Promise<CatalogPage<StoredCategory>> {
		const predicates: string[] = [];
		const bindings: unknown[] = [];
		if (query.search !== undefined) {
			predicates.push("(c.name LIKE ? ESCAPE '\\' OR c.slug LIKE ? ESCAPE '\\')");
			const search = `%${escapeLike(query.search)}%`;
			bindings.push(search, search);
		}
		if (query.active !== undefined) {
			predicates.push("c.active = ?");
			bindings.push(query.active ? 1 : 0);
		}
		const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
		const order = categorySort[query.sortBy];
		const [items, count] = await this.database.batch([
			this.database.prepare(
				`SELECT c.id, c.name, c.slug, c.description, c.active, c.created_at, c.updated_at,
				 (SELECT count(*) FROM product p WHERE p.category_id = c.id) AS product_count
				 FROM category c ${where} ORDER BY ${order} ${query.sortDirection.toUpperCase()}, c.id ASC LIMIT ? OFFSET ?`,
			).bind(...bindings, query.pageSize, pageOffset(query.page, query.pageSize)),
			this.database.prepare(`SELECT count(*) AS total FROM category c ${where}`).bind(...bindings),
		]);
		return {
			items: items.results as StoredCategory[],
			totalItems: Number((count.results[0] as { total?: number } | undefined)?.total ?? 0),
		};
	}

	async createCategory(input: CategoryCreateInput): Promise<StoredCategory> {
		const id = crypto.randomUUID();
		const now = Date.now();
		await this.database.prepare(
			"INSERT INTO category (id, name, slug, description, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).bind(id, input.name, input.slug, input.description, input.active ? 1 : 0, now, now).run();
		return (await this.getCategory(id))!;
	}

	async updateCategory(id: string, input: CategoryCreateInput): Promise<StoredCategory | null> {
		const result = await this.database.prepare(
			"UPDATE category SET name = ?, slug = ?, description = ?, active = ?, updated_at = ? WHERE id = ?",
		).bind(input.name, input.slug, input.description, input.active ? 1 : 0, Date.now(), id).run();
		if (result.meta.changes !== 1) return null;
		return this.getCategory(id);
	}

	async countActiveProductsForCategory(id: string): Promise<number> {
		const row = await this.database.prepare(
			"SELECT count(*) AS total FROM product WHERE category_id = ? AND active = 1",
		).bind(id).first<{ total: number }>();
		return Number(row?.total ?? 0);
	}

	async listTags(query: CmsTagListQuery): Promise<CatalogPage<StoredTag>> {
		const predicates: string[] = [];
		const bindings: unknown[] = [];
		if (query.search !== undefined) {
			predicates.push("(t.name LIKE ? ESCAPE '\\' OR t.slug LIKE ? ESCAPE '\\')");
			const search = `%${escapeLike(query.search)}%`;
			bindings.push(search, search);
		}
		if (query.active !== undefined) {
			predicates.push("t.active = ?");
			bindings.push(query.active ? 1 : 0);
		}
		const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
		const order = tagSort[query.sortBy];
		const [items, count] = await this.database.batch([
			this.database.prepare(
				`SELECT t.id, t.name, t.slug, t.active, t.created_at, t.updated_at,
				 (SELECT count(*) FROM product_tag pt WHERE pt.tag_id = t.id) AS product_count
				 FROM tag t ${where} ORDER BY ${order} ${query.sortDirection.toUpperCase()}, t.id ASC LIMIT ? OFFSET ?`,
			).bind(...bindings, query.pageSize, pageOffset(query.page, query.pageSize)),
			this.database.prepare(`SELECT count(*) AS total FROM tag t ${where}`).bind(...bindings),
		]);
		return {
			items: items.results as StoredTag[],
			totalItems: Number((count.results[0] as { total?: number } | undefined)?.total ?? 0),
		};
	}

	async createTag(input: TagCreateInput): Promise<StoredTag> {
		const id = crypto.randomUUID();
		const now = Date.now();
		await this.database.prepare(
			"INSERT INTO tag (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).bind(id, input.name, input.slug, input.active ? 1 : 0, now, now).run();
		return (await this.getTag(id))!;
	}

	async updateTag(id: string, input: TagCreateInput): Promise<StoredTag | null> {
		const result = await this.database.prepare(
			"UPDATE tag SET name = ?, slug = ?, active = ?, updated_at = ? WHERE id = ?",
		).bind(input.name, input.slug, input.active ? 1 : 0, Date.now(), id).run();
		if (result.meta.changes !== 1) return null;
		return this.getTag(id);
	}

	async listProducts(query: CmsProductListQuery): Promise<CatalogPage<StoredProduct>> {
		const predicates: string[] = [];
		const bindings: unknown[] = [];
		if (query.search !== undefined) {
			const search = `%${escapeLike(query.search)}%`;
			predicates.push("(p.name LIKE ? ESCAPE '\\' OR p.code LIKE ? ESCAPE '\\' OR p.slug LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
			bindings.push(search, search, search, search, search);
		}
		if (query.categoryId !== undefined) {
			predicates.push("p.category_id = ?");
			bindings.push(query.categoryId);
		}
		if (query.tagId !== undefined) {
			predicates.push("EXISTS (SELECT 1 FROM product_tag pt WHERE pt.product_id = p.id AND pt.tag_id = ?)");
			bindings.push(query.tagId);
		}
		if (query.active !== undefined) {
			predicates.push("p.active = ?");
			bindings.push(query.active ? 1 : 0);
		}
		const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
		const [items, count] = await this.database.batch([
			this.database.prepare(
				`${productProjectionSelect} ${productProjectionFrom} ${where} ORDER BY ${productSort[query.sortBy]} ${query.sortDirection.toUpperCase()}, p.id ASC LIMIT ? OFFSET ?`,
			).bind(...bindings, query.pageSize, pageOffset(query.page, query.pageSize)),
			this.database.prepare(`SELECT count(*) AS total FROM product p JOIN category c ON c.id = p.category_id ${where}`).bind(...bindings),
		]);
		return {
			items: (items.results as ProductProjectionRow[]).map(productFromProjection),
			totalItems: Number((count.results[0] as { total?: number } | undefined)?.total ?? 0),
		};
	}

	async getProduct(id: string): Promise<StoredProductDetail | null> {
		const [productResult, tagsResult, imagesResult, offeringsResult] = await this.database.batch([
			this.database.prepare(`${productProjectionSelect} ${productProjectionFrom} WHERE p.id = ?`).bind(id),
			this.database.prepare(
				`SELECT t.id, t.name, t.slug, t.active, t.created_at, t.updated_at,
				 (SELECT count(*) FROM product_tag pt WHERE pt.tag_id = t.id) AS product_count
				 FROM tag t JOIN product_tag pt ON pt.tag_id = t.id WHERE pt.product_id = ? ORDER BY t.name ASC, t.id ASC`,
			).bind(id),
			this.database.prepare(
				"SELECT id, product_id, mime_type, byte_size, alt_text, display_order, created_at FROM product_image WHERE product_id = ? ORDER BY display_order ASC, id ASC",
			).bind(id),
			this.database.prepare(
				"SELECT id, product_id, sku, label, pack_quantity, weight_value, weight_unit, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at FROM offering WHERE product_id = ? ORDER BY created_at ASC, id ASC",
			).bind(id),
		]);
		const row = productResult.results[0] as ProductProjectionRow | undefined;
		if (!row) return null;
		return {
			...productFromProjection(row),
			tags: tagsResult.results as StoredTag[],
			images: imagesResult.results as StoredProductImage[],
			offerings: offeringsResult.results as StoredOffering[],
		};
	}

	async getProductCategory(id: string): Promise<StoredCategory | null> {
		return this.getCategory(id);
	}

	async getTagsByIds(ids: string[]): Promise<StoredTag[]> {
		if (ids.length === 0) return [];
		return (await this.database.prepare(
			`SELECT t.id, t.name, t.slug, t.active, t.created_at, t.updated_at,
			 (SELECT count(*) FROM product_tag pt WHERE pt.tag_id = t.id) AS product_count
			 FROM tag t WHERE t.id IN (${ids.map(() => "?").join(", ")})`,
		).bind(...ids).all()).results as StoredTag[];
	}

	async hasActiveOffering(productId: string): Promise<boolean> {
		const offering = await this.database.prepare(
			"SELECT 1 AS active_offering FROM offering WHERE product_id = ? AND active = 1 LIMIT 1",
		).bind(productId).first<{ active_offering: number }>();
		return offering !== null;
	}

	async createProduct(input: ProductCreateInput): Promise<StoredProductDetail | null> {
		const id = crypto.randomUUID();
		const now = Date.now();
		const temporaryVersion = -1;
		const statements = [
			this.database.prepare(
				"INSERT INTO product (id, code, slug, name, description, base_weight_value, base_weight_unit, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			).bind(id, input.code, input.slug, input.name, input.description, input.baseWeightValue, input.baseWeightUnit, input.categoryId, input.active ? 1 : 0, temporaryVersion, now, now),
			...this.replaceProductTags(id, input.tagIds, temporaryVersion),
			this.database.prepare("UPDATE product SET version = 1 WHERE id = ? AND version = ?").bind(id, temporaryVersion),
		];
		const results = await this.database.batch(statements);
		if (results.at(-1)?.meta.changes !== 1) return null;
		return this.getProduct(id);
	}

	async updateProduct(id: string, input: ProductUpdateInput): Promise<StoredProductDetail | null> {
		const temporaryVersion = -input.version;
		const now = Date.now();
		const statements = [
			this.database.prepare(
				"UPDATE product SET code = ?, slug = ?, name = ?, description = ?, base_weight_value = ?, base_weight_unit = ?, category_id = ?, active = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?",
			).bind(input.code, input.slug, input.name, input.description, input.baseWeightValue, input.baseWeightUnit, input.categoryId, input.active ? 1 : 0, temporaryVersion, now, id, input.version),
			...this.replaceProductTags(id, input.tagIds, temporaryVersion),
			this.database.prepare("UPDATE product SET version = ? WHERE id = ? AND version = ?").bind(input.version + 1, id, temporaryVersion),
		];
		const results = await this.database.batch(statements);
		if (results.at(-1)?.meta.changes !== 1) return null;
		return this.getProduct(id);
	}

	private replaceProductTags(productId: string, tagIds: string[], temporaryVersion: number): D1PreparedStatement[] {
		const guard = "EXISTS (SELECT 1 FROM product WHERE id = ? AND version = ?)";
		return [
			this.database.prepare(`DELETE FROM product_tag WHERE product_id = ? AND ${guard}`).bind(productId, productId, temporaryVersion),
			...tagIds.map((tagId) => this.database.prepare(
				`INSERT INTO product_tag (product_id, tag_id) SELECT ?, ? WHERE ${guard}`,
			).bind(productId, tagId, productId, temporaryVersion)),
		];
	}

	private async getCategory(id: string): Promise<StoredCategory | null> {
		return this.database.prepare(
			`SELECT c.id, c.name, c.slug, c.description, c.active, c.created_at, c.updated_at,
			 (SELECT count(*) FROM product p WHERE p.category_id = c.id) AS product_count
			 FROM category c WHERE c.id = ?`,
		).bind(id).first<StoredCategory>();
	}

	private async getTag(id: string): Promise<StoredTag | null> {
		return this.database.prepare(
			`SELECT t.id, t.name, t.slug, t.active, t.created_at, t.updated_at,
			 (SELECT count(*) FROM product_tag pt WHERE pt.tag_id = t.id) AS product_count
			 FROM tag t WHERE t.id = ?`,
		).bind(id).first<StoredTag>();
	}
}

export function escapeLike(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
