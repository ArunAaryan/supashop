import type { PublicProductListQuery, PublicSearchQuery } from "../../../shared/contracts/catalog";
import { CatalogRepository, type CatalogPage, type StoredCategory, type StoredProductDetail, type StoredTag } from "./catalog-repository";

const effectivePrice = "o.list_price_minor - CASE o.discount_type WHEN 'fixed' THEN o.discount_value WHEN 'percentage' THEN CAST(o.list_price_minor * o.discount_value / 10000 AS INTEGER) ELSE 0 END";
const minimumPrice = `(SELECT min(${effectivePrice}) FROM offering o WHERE o.product_id = p.id AND o.active = 1)`;

type PublicQuery = PublicProductListQuery | PublicSearchQuery;

export class PublicCatalogRepository {
	private readonly catalog: CatalogRepository;

	constructor(private readonly database: D1Database) {
		this.catalog = new CatalogRepository(database);
	}

	async listCategories(): Promise<StoredCategory[]> {
		const result = await this.database.prepare(
			`SELECT c.id, c.name, c.slug, c.description, c.active, c.created_at, c.updated_at,
			 (SELECT count(*) FROM product p WHERE p.category_id = c.id AND p.active = 1 AND EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1)) AS product_count
			 FROM category c WHERE c.active = 1 ORDER BY c.name ASC, c.id ASC`,
		).all();
		return result.results as StoredCategory[];
	}

	async listTags(): Promise<StoredTag[]> {
		const result = await this.database.prepare(
			`SELECT t.id, t.name, t.slug, t.active, t.created_at, t.updated_at,
			 (SELECT count(*) FROM product_tag pt JOIN product p ON p.id = pt.product_id JOIN category c ON c.id = p.category_id WHERE pt.tag_id = t.id AND p.active = 1 AND c.active = 1 AND EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1)) AS product_count
			 FROM tag t WHERE t.active = 1 ORDER BY t.name ASC, t.id ASC`,
		).all();
		return result.results as StoredTag[];
	}

	async listProducts(query: PublicQuery): Promise<CatalogPage<StoredProductDetail>> {
		const predicates = ["p.active = 1", "c.active = 1", "EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1)"];
		const bindings: unknown[] = [];
		if (query.categorySlug !== undefined) { predicates.push("c.slug = ?"); bindings.push(query.categorySlug); }
		if (query.tagSlug !== undefined) {
			predicates.push("EXISTS (SELECT 1 FROM product_tag pt JOIN tag t ON t.id = pt.tag_id WHERE pt.product_id = p.id AND t.active = 1 AND t.slug = ?)");
			bindings.push(query.tagSlug);
		}
		if (query.inStock !== undefined) predicates.push(query.inStock
			? "EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1 AND o.stock_quantity > 0)"
			: "NOT EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1 AND o.stock_quantity > 0)");
		if (query.minPriceMinor !== undefined) { predicates.push(`${minimumPrice} >= ?`); bindings.push(query.minPriceMinor); }
		if (query.maxPriceMinor !== undefined) { predicates.push(`${minimumPrice} <= ?`); bindings.push(query.maxPriceMinor); }
		if ("search" in query) {
			const search = `%${escapeLike(query.search)}%`;
			predicates.push(`(p.name LIKE ? ESCAPE '\\' OR p.code LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM product_tag pt JOIN tag t ON t.id = pt.tag_id WHERE pt.product_id = p.id AND t.active = 1 AND t.name LIKE ? ESCAPE '\\') OR EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1 AND (o.label LIKE ? ESCAPE '\\' OR o.sku LIKE ? ESCAPE '\\')))`);
			bindings.push(search, search, search, search, search, search, search);
		}
		const where = `WHERE ${predicates.join(" AND ")}`;
		const sort = query.sortBy === "price" ? minimumPrice : query.sortBy === "newest" ? "p.created_at" : query.sortBy === "relevance" ? "p.name" : "p.name";
		const [idsResult, countResult] = await this.database.batch([
			this.database.prepare(`SELECT p.id FROM product p JOIN category c ON c.id = p.category_id ${where} ORDER BY ${sort} ${query.sortDirection.toUpperCase()}, p.id ASC LIMIT ? OFFSET ?`).bind(...bindings, query.pageSize, (query.page - 1) * query.pageSize),
			this.database.prepare(`SELECT count(*) AS total FROM product p JOIN category c ON c.id = p.category_id ${where}`).bind(...bindings),
		]);
		const details = await Promise.all((idsResult.results as Array<{ id: string }>).map(({ id }) => this.catalog.getProduct(id)));
		return {
			items: details.filter((item): item is StoredProductDetail => item !== null),
			totalItems: Number((countResult.results[0] as { total?: number } | undefined)?.total ?? 0),
		};
	}

	async getProductBySlug(slug: string): Promise<StoredProductDetail | null> {
		const row = await this.database.prepare(
			"SELECT p.id FROM product p JOIN category c ON c.id = p.category_id WHERE p.slug = ? AND p.active = 1 AND c.active = 1 AND EXISTS (SELECT 1 FROM offering o WHERE o.product_id = p.id AND o.active = 1)",
		).bind(slug).first<{ id: string }>();
		return row ? this.catalog.getProduct(row.id) : null;
	}
}

export function escapeLike(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
