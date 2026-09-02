import { calculateEffectivePrice } from "../../../shared/domain/discount";

export type CartOwner =
	| { kind: "user"; id: string }
	| { kind: "guest"; id: string };

export type StoredCart = { updated_at: number };

export type StoredCartLine = {
	offering_id: string;
	product_id: string;
	product_slug: string;
	product_name: string;
	offering_label: string;
	image_url: string | null;
	quantity: number;
	line_version: number;
	effective_price_minor_at_add: number;
	list_price_minor: number;
	discount_type: "none" | "fixed" | "percentage";
	discount_value: number;
	stock_quantity: number;
	offering_active: number;
	product_active: number;
	category_active: number;
};

export type StoredOfferingForCart = Pick<StoredCartLine,
	| "offering_id"
	| "list_price_minor"
	| "discount_type"
	| "discount_value"
	| "stock_quantity"
	| "offering_active"
	| "product_active"
	| "category_active"
>;

function cartId(owner: CartOwner) {
	return `${owner.kind}:${owner.id}`;
}

export function currentEffectivePrice(row: StoredOfferingForCart) {
	return calculateEffectivePrice(
		row.list_price_minor,
		row.discount_type,
		row.discount_value,
	).effectivePriceMinor;
}

export class CartRepository {
	constructor(private readonly database: D1Database) {}

	async ensureCart(owner: CartOwner): Promise<string> {
		const id = cartId(owner);
		const now = Date.now();
		await this.database.prepare(
			"INSERT OR IGNORE INTO cart (id, user_id, guest_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).bind(id, owner.kind === "user" ? owner.id : null, owner.kind === "guest" ? owner.id : null, now, now).run();
		return id;
	}

	async getCart(owner: CartOwner): Promise<StoredCart | null> {
		return this.database.prepare("SELECT updated_at FROM cart WHERE id = ?").bind(cartId(owner)).first<StoredCart>();
	}

	async getLines(owner: CartOwner): Promise<StoredCartLine[]> {
		const result = await this.database.prepare(
			`SELECT ci.offering_id, p.id AS product_id, p.slug AS product_slug, p.name AS product_name,
				o.label AS offering_label, '/api/catalog/images/' || image.id AS image_url,
				ci.quantity, ci.version AS line_version, ci.effective_price_minor_at_add,
				o.list_price_minor, o.discount_type, o.discount_value, o.stock_quantity,
				o.active AS offering_active, p.active AS product_active, c.active AS category_active
			 FROM cart_item ci
			 JOIN offering o ON o.id = ci.offering_id
			 JOIN product p ON p.id = o.product_id
			 JOIN category c ON c.id = p.category_id
			 LEFT JOIN product_image image ON image.product_id = p.id AND image.display_order = 0
			 WHERE ci.cart_id = ?
			 ORDER BY ci.created_at ASC, ci.offering_id ASC`,
		).bind(cartId(owner)).all();
		return result.results as StoredCartLine[];
	}

	async getOffering(id: string): Promise<StoredOfferingForCart | null> {
		return this.database.prepare(
			`SELECT o.id AS offering_id, o.list_price_minor, o.discount_type, o.discount_value,
				o.stock_quantity, o.active AS offering_active, p.active AS product_active, c.active AS category_active
			 FROM offering o JOIN product p ON p.id = o.product_id JOIN category c ON c.id = p.category_id
			 WHERE o.id = ?`,
		).bind(id).first<StoredOfferingForCart>();
	}

	async getItem(owner: CartOwner, offeringId: string): Promise<{ quantity: number; version: number } | null> {
		return this.database.prepare("SELECT quantity, version FROM cart_item WHERE cart_id = ? AND offering_id = ?")
			.bind(cartId(owner), offeringId)
			.first<{ quantity: number; version: number }>();
	}

	async insertItem(owner: CartOwner, offeringId: string, quantity: number, unitPriceMinor: number): Promise<boolean> {
		const now = Date.now();
		const result = await this.database.batch([
			this.database.prepare(
				"INSERT INTO cart_item (cart_id, offering_id, quantity, effective_price_minor_at_add, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
			).bind(cartId(owner), offeringId, quantity, unitPriceMinor, now, now),
			this.database.prepare("UPDATE cart SET updated_at = ? WHERE id = ?").bind(now, cartId(owner)),
		]);
		return result[0]?.meta.changes === 1;
	}

	async updateItem(owner: CartOwner, offeringId: string, quantity: number, version: number): Promise<boolean> {
		const now = Date.now();
		const id = cartId(owner);
		const result = await this.database.batch([
			this.database.prepare(
				"UPDATE cart SET updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM cart_item WHERE cart_id = ? AND offering_id = ? AND version = ?)",
			).bind(now, id, id, offeringId, version),
			this.database.prepare(
				"UPDATE cart_item SET quantity = ?, version = version + 1, updated_at = ? WHERE cart_id = ? AND offering_id = ? AND version = ?",
			).bind(quantity, now, id, offeringId, version),
		]);
		return result[1]?.meta.changes === 1;
	}

	async deleteItem(owner: CartOwner, offeringId: string): Promise<boolean> {
		const now = Date.now();
		const id = cartId(owner);
		const result = await this.database.batch([
			this.database.prepare(
				"UPDATE cart SET updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM cart_item WHERE cart_id = ? AND offering_id = ?)",
			).bind(now, id, id, offeringId),
			this.database.prepare("DELETE FROM cart_item WHERE cart_id = ? AND offering_id = ?").bind(id, offeringId),
		]);
		return result[1]?.meta.changes === 1;
	}

	async merge(registered: CartOwner, guest: CartOwner): Promise<void> {
		const registeredCartId = cartId(registered);
		const guestCartId = cartId(guest);
		const now = Date.now();
		await this.database.batch([
			this.database.prepare(
				"INSERT OR IGNORE INTO cart (id, user_id, guest_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",
			).bind(registeredCartId, registered.id, now, now),
			this.database.prepare(
				`INSERT INTO cart_item (cart_id, offering_id, quantity, effective_price_minor_at_add, version, created_at, updated_at)
				 SELECT ?, offering_id, quantity, effective_price_minor_at_add, 1, ?, ? FROM cart_item WHERE cart_id = ?
				 ON CONFLICT(cart_id, offering_id) DO UPDATE SET
				 quantity = cart_item.quantity + excluded.quantity,
				 version = cart_item.version + 1,
				 updated_at = excluded.updated_at`,
			).bind(registeredCartId, now, now, guestCartId),
			this.database.prepare("DELETE FROM cart WHERE id = ?").bind(guestCartId),
			this.database.prepare("UPDATE cart SET updated_at = ? WHERE id = ?").bind(now, registeredCartId),
		]);
	}

}
