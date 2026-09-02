import type {
	CmsInventoryMovementListQuery,
	CmsOfferingListQuery,
	OfferingCreateInput,
	OfferingUpdateInput,
} from "../../../shared/contracts/catalog";
import type { CatalogPage } from "./catalog-repository";

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

export type StoredMovement = {
	id: string;
	offering_id: string;
	previous_quantity: number;
	quantity_delta: number;
	resulting_quantity: number;
	reason: string;
	movement_type: "manual_adjustment";
	actor_user_id: string;
	offering_version: number;
	created_at: number;
};

const offeringColumns = "id, product_id, sku, label, pack_quantity, weight_value, weight_unit, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at";
const movementColumns = "id, offering_id, previous_quantity, quantity_delta, resulting_quantity, reason, movement_type, actor_user_id, offering_version, created_at";

const offeringSort = {
	sku: "o.sku",
	label: "o.label",
	listPriceMinor: "o.list_price_minor",
	effectivePriceMinor: "CASE o.discount_type WHEN 'fixed' THEN o.list_price_minor - o.discount_value WHEN 'percentage' THEN o.list_price_minor - CAST(o.list_price_minor * o.discount_value / 10000 AS INTEGER) ELSE o.list_price_minor END",
	stockQuantity: "o.stock_quantity",
	updatedAt: "o.updated_at",
} as const;

export class OfferingRepository {
	constructor(private readonly database: D1Database) {}

	async listOfferings(query: CmsOfferingListQuery): Promise<CatalogPage<StoredOffering>> {
		const predicates: string[] = [];
		const bindings: unknown[] = [];
		if (query.search !== undefined) {
			predicates.push("(o.sku LIKE ? ESCAPE '\\' OR o.label LIKE ? ESCAPE '\\')");
			const value = `%${escapeLike(query.search)}%`;
			bindings.push(value, value);
		}
		if (query.productId !== undefined) { predicates.push("o.product_id = ?"); bindings.push(query.productId); }
		if (query.active !== undefined) { predicates.push("o.active = ?"); bindings.push(query.active ? 1 : 0); }
		if (query.inStock !== undefined) { predicates.push(query.inStock ? "o.stock_quantity > 0" : "o.stock_quantity = 0"); }
		if (query.lowStock !== undefined) { predicates.push(query.lowStock ? "o.stock_quantity <= o.low_stock_threshold" : "o.stock_quantity > o.low_stock_threshold"); }
		const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
		const [items, count] = await this.database.batch([
			this.database.prepare(`SELECT ${offeringColumns} FROM offering o ${where} ORDER BY ${offeringSort[query.sortBy]} ${query.sortDirection.toUpperCase()}, o.id ASC LIMIT ? OFFSET ?`).bind(...bindings, query.pageSize, (query.page - 1) * query.pageSize),
			this.database.prepare(`SELECT count(*) AS total FROM offering o ${where}`).bind(...bindings),
		]);
		return { items: items.results as StoredOffering[], totalItems: Number((count.results[0] as { total?: number } | undefined)?.total ?? 0) };
	}

	async getOffering(id: string): Promise<StoredOffering | null> {
		return this.database.prepare(`SELECT ${offeringColumns} FROM offering WHERE id = ?`).bind(id).first<StoredOffering>();
	}

	async createOffering(input: OfferingCreateInput): Promise<StoredOffering> {
		const id = crypto.randomUUID();
		const now = Date.now();
		await this.database.prepare(
			"INSERT INTO offering (id, product_id, sku, label, pack_quantity, weight_value, weight_unit, list_price_minor, discount_type, discount_value, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
		).bind(id, input.productId, input.sku, input.label, input.packQuantity, input.weightValue, input.weightUnit, input.listPriceMinor, input.discountType, input.discountValue, input.lowStockThreshold, input.active ? 1 : 0, now, now).run();
		return (await this.getOffering(id))!;
	}

	async updateOffering(id: string, input: OfferingUpdateInput): Promise<boolean> {
		const result = await this.database.prepare(
			"UPDATE offering SET sku = ?, label = ?, pack_quantity = ?, weight_value = ?, weight_unit = ?, list_price_minor = ?, discount_type = ?, discount_value = ?, low_stock_threshold = ?, active = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
		).bind(input.sku, input.label, input.packQuantity, input.weightValue, input.weightUnit, input.listPriceMinor, input.discountType, input.discountValue, input.lowStockThreshold, input.active ? 1 : 0, Date.now(), id, input.version).run();
		return result.meta.changes === 1;
	}

	async countActiveOfferings(productId: string, exceptId?: string): Promise<number> {
		const row = exceptId === undefined
			? await this.database.prepare("SELECT count(*) AS total FROM offering WHERE product_id = ? AND active = 1").bind(productId).first<{ total: number }>()
			: await this.database.prepare("SELECT count(*) AS total FROM offering WHERE product_id = ? AND active = 1 AND id <> ?").bind(productId, exceptId).first<{ total: number }>();
		return Number(row?.total ?? 0);
	}

	async productExists(id: string): Promise<boolean> {
		return Boolean(await this.database.prepare("SELECT 1 AS found FROM product WHERE id = ?").bind(id).first());
	}

	async productIsActive(id: string): Promise<boolean> {
		return Boolean((await this.database.prepare("SELECT active FROM product WHERE id = ?").bind(id).first<{ active: number }>())?.active);
	}

	async adjustInventory(id: string, desired: number, previous: number, version: number, reason: string, actorUserId: string): Promise<{ movementId: string; changed: boolean }> {
		const movementId = crypto.randomUUID();
		const now = Date.now();
		const results = await this.database.batch([
			this.database.prepare(
				"INSERT INTO inventory_movement (id, offering_id, previous_quantity, quantity_delta, resulting_quantity, reason, movement_type, actor_user_id, offering_version, created_at) SELECT ?, id, stock_quantity, ? - stock_quantity, ?, ?, 'manual_adjustment', ?, version + 1, ? FROM offering WHERE id = ? AND version = ? AND stock_quantity = ? AND ? >= 0 AND ? <> stock_quantity",
			).bind(movementId, desired, desired, reason, actorUserId, now, id, version, previous, desired, desired),
			this.database.prepare(
				"UPDATE offering SET stock_quantity = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND stock_quantity = ? AND ? <> stock_quantity",
			).bind(desired, now, id, version, previous, desired),
		]);
		return { movementId, changed: results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 };
	}

	async getMovement(id: string): Promise<StoredMovement | null> {
		return this.database.prepare(`SELECT ${movementColumns} FROM inventory_movement WHERE id = ?`).bind(id).first<StoredMovement>();
	}

	async listMovements(query: CmsInventoryMovementListQuery): Promise<CatalogPage<StoredMovement>> {
		const predicates: string[] = [];
		const bindings: unknown[] = [];
		if (query.offeringId !== undefined) { predicates.push("offering_id = ?"); bindings.push(query.offeringId); }
		if (query.movementType !== undefined) { predicates.push("movement_type = ?"); bindings.push(query.movementType); }
		if (query.actorUserId !== undefined) { predicates.push("actor_user_id = ?"); bindings.push(query.actorUserId); }
		if (query.createdFrom !== undefined) { predicates.push("created_at >= ?"); bindings.push(query.createdFrom); }
		if (query.createdTo !== undefined) { predicates.push("created_at <= ?"); bindings.push(query.createdTo); }
		const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
		const [items, count] = await this.database.batch([
			this.database.prepare(`SELECT ${movementColumns} FROM inventory_movement ${where} ORDER BY created_at ${query.sortDirection.toUpperCase()}, id ASC LIMIT ? OFFSET ?`).bind(...bindings, query.pageSize, (query.page - 1) * query.pageSize),
			this.database.prepare(`SELECT count(*) AS total FROM inventory_movement ${where}`).bind(...bindings),
		]);
		return { items: items.results as StoredMovement[], totalItems: Number((count.results[0] as { total?: number } | undefined)?.total ?? 0) };
	}
}

function escapeLike(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
