import type { CheckoutInput } from "../../../shared/contracts/order";
import type { CustomerPrincipal } from "../../auth/customer-principal";

export type StoredCheckoutLine = {
	offering_id: string;
	quantity: number;
	product_id: string;
	product_code: string;
	product_name: string;
	offering_sku: string;
	offering_label: string;
	pack_quantity: number | null;
	weight_value: number | null;
	weight_unit: "g" | "kg" | "ml" | "l" | null;
	list_price_minor: number;
	discount_type: "none" | "fixed" | "percentage";
	discount_value: number;
	effective_unit_price_minor: number;
	stock_quantity: number;
	offering_version: number;
	offering_active: number;
	product_active: number;
	category_active: number;
};

export type CheckoutCartState = {
	updatedAt: number | null;
	lines: StoredCheckoutLine[];
};

export type StoredOrder = {
	id: string;
	order_number: string;
	status: "placed" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled" | "rejected";
	payment_status: "pending" | "collected" | "exception";
	currency: "INR";
	subtotal_minor: number;
	delivery_fee_minor: number;
	total_minor: number;
	placed_at: number;
	expected_delivery_at: number | null;
	cancelled_at: number | null;
	version: number;
	item_count: number;
};

export type StoredOrderAddress = {
	order_id: string;
	recipient_name: string;
	mobile: string;
	address_line_1: string;
	address_line_2: string;
	landmark: string;
	city: string;
	state: string;
	postal_code: string;
	latitude: number | null;
	longitude: number | null;
	delivery_instructions: string;
};

export type StoredOrderItem = {
	offering_id: string;
	product_id: string;
	product_code: string;
	product_name: string;
	offering_sku: string;
	offering_label: string;
	pack_quantity: number | null;
	weight_value: number | null;
	weight_unit: "g" | "kg" | "ml" | "l" | null;
	list_price_minor: number;
	discount_type: "none" | "fixed" | "percentage";
	discount_value: number;
	effective_unit_price_minor: number;
	quantity: number;
	line_total_minor: number;
};

export type StoredStatusHistory = {
	id: string;
	from_status: StoredOrder["status"] | null;
	to_status: StoredOrder["status"];
	reason: string | null;
	actor_user_id: string | null;
	created_at: number;
};

export type StoredOrderDetail = {
	order: StoredOrder;
	address: StoredOrderAddress;
	items: StoredOrderItem[];
	history: StoredStatusHistory[];
};

type StoredIdempotency = { request_hash: string; order_id: string };
type StockForCancellation = { offering_id: string; quantity: number; stock_quantity: number; version: number };
type ReorderSnapshotLine = StoredOrderItem & {
	stock_quantity: number | null;
	offering_version: number | null;
	offering_active: number | null;
	product_active: number | null;
	category_active: number | null;
	current_effective_price_minor: number | null;
	cart_quantity: number | null;
};

type CheckoutCommit = {
	orderId: string;
	orderNumber: string;
	owner: CustomerPrincipal;
	input: CheckoutInput;
	lines: StoredCheckoutLine[];
	requestHash: string;
	idempotencyKey: string;
};

function ownerWhere(owner: CustomerPrincipal, alias = "o") {
	return owner.kind === "user" ? `${alias}.user_id = ?` : `${alias}.guest_id = ?`;
}

function ownerBinding(owner: CustomerPrincipal) {
	return owner.id;
}

function cartId(owner: CustomerPrincipal) {
	return owner.ownerKey;
}

function effectivePriceExpression(alias: string) {
	return `CASE ${alias}.discount_type WHEN 'fixed' THEN ${alias}.list_price_minor - ${alias}.discount_value WHEN 'percentage' THEN ${alias}.list_price_minor - CAST(${alias}.list_price_minor * ${alias}.discount_value / 10000 AS INTEGER) ELSE ${alias}.list_price_minor END`;
}

export class OrderRepository {
	constructor(private readonly database: D1Database) {}

	async findIdempotency(owner: CustomerPrincipal, key: string): Promise<StoredIdempotency | null> {
		return this.database.prepare(
			"SELECT request_hash, order_id FROM checkout_idempotency WHERE owner_key = ? AND idempotency_key = ?",
		).bind(owner.ownerKey, key).first<StoredIdempotency>();
	}

	async getCheckoutCart(owner: CustomerPrincipal): Promise<CheckoutCartState> {
		const id = cartId(owner);
		const [cart, lines] = await this.database.batch([
			this.database.prepare("SELECT updated_at FROM cart WHERE id = ?").bind(id),
			this.database.prepare(
				`SELECT ci.offering_id, ci.quantity, p.id AS product_id, p.code AS product_code, p.name AS product_name,
					o.sku AS offering_sku, o.label AS offering_label, o.pack_quantity, o.weight_value, o.weight_unit,
					o.list_price_minor, o.discount_type, o.discount_value,
					${effectivePriceExpression("o")} AS effective_unit_price_minor,
					o.stock_quantity, o.version AS offering_version, o.active AS offering_active,
					p.active AS product_active, c.active AS category_active
				 FROM cart_item ci
				 JOIN offering o ON o.id = ci.offering_id
				 JOIN product p ON p.id = o.product_id
				 JOIN category c ON c.id = p.category_id
				 WHERE ci.cart_id = ? ORDER BY ci.offering_id`,
			).bind(id),
		]);
		return {
			updatedAt: Number((cart.results[0] as { updated_at?: number } | undefined)?.updated_at ?? null) || null,
			lines: lines.results as StoredCheckoutLine[],
		};
	}

	async commitCheckout(value: CheckoutCommit): Promise<void> {
		const now = Date.now();
		const cart = cartId(value.owner);
		const subtotal = value.lines.reduce((total, line) => total + line.effective_unit_price_minor * line.quantity, 0);
		const expectedByOffering = new Map(value.input.expectedLines.map((line) => [line.offeringId, line]));
		const checks = [
			"EXISTS (SELECT 1 FROM cart WHERE id = ? AND updated_at = ?)",
			"(SELECT count(*) FROM cart_item WHERE cart_id = ?) = ?",
			...value.lines.map((line) => {
				const expected = expectedByOffering.get(line.offering_id);
				if (!expected) throw new Error("Checkout lines were not validated");
				return `EXISTS (
					SELECT 1 FROM cart_item ci
					JOIN offering o ON o.id = ci.offering_id
					JOIN product p ON p.id = o.product_id
					JOIN category c ON c.id = p.category_id
					WHERE ci.cart_id = ? AND ci.offering_id = ? AND ci.quantity = ?
						AND o.version = ? AND ${effectivePriceExpression("o")} = ?
						AND o.active = 1 AND p.active = 1 AND c.active = 1 AND o.stock_quantity >= ?
				)`;
			}),
		];
		const checkBindings: unknown[] = [cart, value.input.cartUpdatedAt, cart, value.lines.length];
		for (const line of value.lines) {
			const expected = expectedByOffering.get(line.offering_id)!;
			checkBindings.push(cart, line.offering_id, expected.quantity, expected.offeringVersion, expected.expectedUnitPriceMinor, expected.quantity);
		}

		const address = value.input.deliveryAddress;
		const validCondition = checks.join(" AND ");
		const statements: D1PreparedStatement[] = [
			this.database.prepare(
				`WITH valid(ok) AS (SELECT CASE WHEN ${validCondition} THEN 1 ELSE 0 END)
				 INSERT INTO commerce_order (id, order_number, user_id, guest_id, status, payment_status, currency, subtotal_minor, delivery_fee_minor, total_minor, placed_at, expected_delivery_at, cancelled_at, version, created_at, updated_at)
				 SELECT ?, ?, ?, ?, 'placed', 'pending', 'INR', CASE WHEN ok = 1 THEN ? ELSE -1 END, 0, CASE WHEN ok = 1 THEN ? ELSE -1 END, ?, NULL, NULL, 1, ?, ? FROM valid`,
			).bind(...checkBindings, value.orderId, value.orderNumber, value.owner.kind === "user" ? value.owner.id : null, value.owner.kind === "guest" ? value.owner.id : null, subtotal, subtotal, now, now, now),
			this.database.prepare(
				"INSERT INTO order_address (order_id, recipient_name, mobile, address_line_1, address_line_2, landmark, city, state, postal_code, latitude, longitude, delivery_instructions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			).bind(value.orderId, address.recipientName, address.mobile, address.addressLine1, address.addressLine2 ?? "", address.landmark ?? "", address.city, address.state, address.postalCode, address.latitude, address.longitude, address.deliveryInstructions ?? ""),
			...value.lines.map((line) => this.database.prepare(
				"INSERT INTO order_item (order_id, offering_id, product_id, product_code, product_name, offering_sku, offering_label, pack_quantity, weight_value, weight_unit, list_price_minor, discount_type, discount_value, effective_unit_price_minor, quantity, line_total_minor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			).bind(value.orderId, line.offering_id, line.product_id, line.product_code, line.product_name, line.offering_sku, line.offering_label, line.pack_quantity, line.weight_value, line.weight_unit, line.list_price_minor, line.discount_type, line.discount_value, line.effective_unit_price_minor, line.quantity, line.effective_unit_price_minor * line.quantity, now)),
			...value.lines.map((line) => this.database.prepare(
				"INSERT INTO inventory_movement (id, offering_id, previous_quantity, quantity_delta, resulting_quantity, reason, movement_type, actor_user_id, order_id, offering_version, created_at) VALUES (?, ?, ?, ?, ?, 'Checkout deduction', 'checkout_deduction', ?, ?, ?, ?)",
			).bind(crypto.randomUUID(), line.offering_id, line.stock_quantity, -line.quantity, line.stock_quantity - line.quantity, value.owner.kind === "user" ? value.owner.id : null, value.orderId, line.offering_version + 1, now)),
			...value.lines.map((line) => this.database.prepare(
				"UPDATE offering SET stock_quantity = stock_quantity - ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND stock_quantity = ?",
			).bind(line.quantity, now, line.offering_id, line.offering_version, line.stock_quantity)),
			this.database.prepare(
				"INSERT INTO order_status_history (id, order_id, from_status, to_status, reason, actor_user_id, metadata, created_at) VALUES (?, ?, NULL, 'placed', NULL, ?, NULL, ?)",
			).bind(crypto.randomUUID(), value.orderId, value.owner.kind === "user" ? value.owner.id : null, now),
			this.database.prepare(
				"INSERT INTO checkout_idempotency (id, owner_key, idempotency_key, request_hash, order_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			).bind(crypto.randomUUID(), value.owner.ownerKey, value.idempotencyKey, value.requestHash, value.orderId, now, now),
		];
		if (value.input.saveAddress && value.owner.kind === "user") {
			statements.push(this.database.prepare(
				`INSERT INTO customer_address (id, user_id, label, recipient_name, mobile, address_line_1, address_line_2, landmark, city, state, postal_code, latitude, longitude, delivery_instructions, is_default, version, created_at, updated_at)
				 SELECT ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN EXISTS (SELECT 1 FROM customer_address WHERE user_id = ?) THEN 0 ELSE 1 END, 1, ?, ?`,
			).bind(crypto.randomUUID(), value.owner.id, address.recipientName, address.mobile, address.addressLine1, address.addressLine2 ?? "", address.landmark ?? "", address.city, address.state, address.postalCode, address.latitude, address.longitude, address.deliveryInstructions ?? "", value.owner.id, now, now));
		}
		statements.push(
			this.database.prepare("DELETE FROM cart_item WHERE cart_id = ?").bind(cart),
			this.database.prepare("UPDATE cart SET updated_at = ? WHERE id = ?").bind(now, cart),
		);
		await this.database.batch(statements);
	}

	async getOrder(owner: CustomerPrincipal, orderNumber: string): Promise<StoredOrderDetail | null> {
		const order = await this.database.prepare(
			`SELECT id, order_number, status, payment_status, currency, subtotal_minor, delivery_fee_minor, total_minor, placed_at, expected_delivery_at, cancelled_at, version,
			 (SELECT COALESCE(sum(quantity), 0) FROM order_item i WHERE i.order_id = o.id) AS item_count
			 FROM commerce_order o WHERE o.order_number = ? AND ${ownerWhere(owner)}`,
		).bind(orderNumber, ownerBinding(owner)).first<StoredOrder>();
		if (!order) return null;
		const [address, items, history] = await this.database.batch([
			this.database.prepare("SELECT order_id, recipient_name, mobile, address_line_1, address_line_2, landmark, city, state, postal_code, latitude, longitude, delivery_instructions FROM order_address WHERE order_id = ?").bind(order.id),
			this.database.prepare("SELECT offering_id, product_id, product_code, product_name, offering_sku, offering_label, pack_quantity, weight_value, weight_unit, list_price_minor, discount_type, discount_value, effective_unit_price_minor, quantity, line_total_minor FROM order_item WHERE order_id = ? ORDER BY offering_id").bind(order.id),
			this.database.prepare("SELECT id, from_status, to_status, reason, actor_user_id, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at, id").bind(order.id),
		]);
		const addressRow = address.results[0] as StoredOrderAddress | undefined;
		if (!addressRow) throw new Error("Order address is missing");
		return { order, address: addressRow, items: items.results as StoredOrderItem[], history: history.results as StoredStatusHistory[] };
	}

	async getOrderById(owner: CustomerPrincipal, orderId: string): Promise<StoredOrderDetail | null> {
		const number = await this.database.prepare(
			`SELECT order_number FROM commerce_order o WHERE o.id = ? AND ${ownerWhere(owner)}`,
		).bind(orderId, ownerBinding(owner)).first<{ order_number: string }>();
		return number ? this.getOrder(owner, number.order_number) : null;
	}

	async listOrders(owner: CustomerPrincipal, page: number, pageSize: number): Promise<{ items: StoredOrder[]; totalItems: number }> {
		const where = ownerWhere(owner);
		const [items, count] = await this.database.batch([
			this.database.prepare(
				`SELECT id, order_number, status, payment_status, currency, subtotal_minor, delivery_fee_minor, total_minor, placed_at, expected_delivery_at, cancelled_at, version,
				 (SELECT COALESCE(sum(quantity), 0) FROM order_item i WHERE i.order_id = o.id) AS item_count
				 FROM commerce_order o WHERE ${where} ORDER BY placed_at DESC, id DESC LIMIT ? OFFSET ?`,
			).bind(ownerBinding(owner), pageSize, (page - 1) * pageSize),
			this.database.prepare(`SELECT count(*) AS total FROM commerce_order o WHERE ${where}`).bind(ownerBinding(owner)),
		]);
		return { items: items.results as StoredOrder[], totalItems: Number((count.results[0] as { total?: number } | undefined)?.total ?? 0) };
	}

	async cancellationStock(orderId: string): Promise<StockForCancellation[]> {
		const result = await this.database.prepare(
			"SELECT i.offering_id, i.quantity, o.stock_quantity, o.version FROM order_item i JOIN offering o ON o.id = i.offering_id WHERE i.order_id = ? ORDER BY i.offering_id",
		).bind(orderId).all<StockForCancellation>();
		return result.results;
	}

	async cancel(owner: CustomerPrincipal, detail: StoredOrderDetail, stock: StockForCancellation[], reason: string): Promise<boolean> {
		const now = Date.now();
		const expectedVersion = detail.order.version;
		const checks = stock.map(() => "EXISTS (SELECT 1 FROM offering WHERE id = ? AND version = ? AND stock_quantity = ?)");
		const bindings = stock.flatMap((line) => [line.offering_id, line.version, line.stock_quantity]);
		const orderGuard = `${ownerWhere(owner)} AND o.id = ? AND o.version = ? AND o.status IN ('placed', 'confirmed')`;
		const statements: D1PreparedStatement[] = [
			this.database.prepare(
				`WITH valid(ok) AS (SELECT CASE WHEN ${checks.join(" AND ") || "1"} THEN 1 ELSE 0 END)
				 UPDATE commerce_order AS o SET status = CASE WHEN (SELECT ok FROM valid) = 1 THEN 'cancelled' ELSE 'invalid' END,
				 cancelled_at = ?, version = version + 1, updated_at = ? WHERE ${orderGuard}`,
			).bind(...bindings, now, now, ownerBinding(owner), detail.order.id, expectedVersion),
			...stock.map((line) => this.database.prepare(
				"UPDATE offering SET stock_quantity = stock_quantity + ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND stock_quantity = ? AND EXISTS (SELECT 1 FROM commerce_order WHERE id = ? AND status = 'cancelled' AND version = ?)",
			).bind(line.quantity, now, line.offering_id, line.version, line.stock_quantity, detail.order.id, expectedVersion + 1)),
			...stock.map((line) => this.database.prepare(
				"INSERT INTO inventory_movement (id, offering_id, previous_quantity, quantity_delta, resulting_quantity, reason, movement_type, actor_user_id, order_id, offering_version, created_at) SELECT ?, ?, ?, ?, ?, ?, 'cancellation_restoration', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM commerce_order WHERE id = ? AND status = 'cancelled' AND version = ?)",
			).bind(crypto.randomUUID(), line.offering_id, line.stock_quantity, line.quantity, line.stock_quantity + line.quantity, reason, owner.kind === "user" ? owner.id : null, detail.order.id, line.version + 1, now, detail.order.id, expectedVersion + 1)),
			this.database.prepare(
				"INSERT INTO order_status_history (id, order_id, from_status, to_status, reason, actor_user_id, metadata, created_at) SELECT ?, ?, ?, 'cancelled', ?, ?, NULL, ? WHERE EXISTS (SELECT 1 FROM commerce_order WHERE id = ? AND status = 'cancelled' AND version = ?)",
			).bind(crypto.randomUUID(), detail.order.id, detail.order.status, reason, owner.kind === "user" ? owner.id : null, now, detail.order.id, expectedVersion + 1),
		];
		const result = await this.database.batch(statements);
		return result[0]?.meta.changes === 1;
	}

	async reorderSnapshot(owner: CustomerPrincipal, orderId: string): Promise<ReorderSnapshotLine[]> {
		const result = await this.database.prepare(
			`SELECT i.offering_id, i.product_id, i.product_code, i.product_name, i.offering_sku, i.offering_label, i.pack_quantity, i.weight_value, i.weight_unit, i.list_price_minor, i.discount_type, i.discount_value, i.effective_unit_price_minor, i.quantity, i.line_total_minor,
				o.stock_quantity, o.version AS offering_version, o.active AS offering_active, p.active AS product_active, c.active AS category_active,
				${effectivePriceExpression("o")} AS current_effective_price_minor, ci.quantity AS cart_quantity
			 FROM order_item i
			 LEFT JOIN offering o ON o.id = i.offering_id
			 LEFT JOIN product p ON p.id = o.product_id
			 LEFT JOIN category c ON c.id = p.category_id
			 LEFT JOIN cart_item ci ON ci.cart_id = ? AND ci.offering_id = i.offering_id
			 WHERE i.order_id = ? ORDER BY i.offering_id`,
		).bind(cartId(owner), orderId).all<ReorderSnapshotLine>();
		return result.results;
	}

	async addReorderLines(owner: CustomerPrincipal, lines: Array<{ offeringId: string; quantity: number; unitPriceMinor: number }>): Promise<number> {
		const now = Date.now();
		const cart = cartId(owner);
		const statements: D1PreparedStatement[] = [
			this.database.prepare("INSERT OR IGNORE INTO cart (id, user_id, guest_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(cart, owner.kind === "user" ? owner.id : null, owner.kind === "guest" ? owner.id : null, now, now),
			...lines.map((line) => this.database.prepare(
				`INSERT INTO cart_item (cart_id, offering_id, quantity, effective_price_minor_at_add, version, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(cart_id, offering_id) DO UPDATE SET quantity = cart_item.quantity + excluded.quantity, version = cart_item.version + 1, updated_at = excluded.updated_at`,
			).bind(cart, line.offeringId, line.quantity, line.unitPriceMinor, now, now)),
			this.database.prepare("UPDATE cart SET updated_at = ? WHERE id = ?").bind(now, cart),
		];
		await this.database.batch(statements);
		const row = await this.database.prepare("SELECT COALESCE(sum(quantity), 0) AS item_count FROM cart_item WHERE cart_id = ?").bind(cart).first<{ item_count: number }>();
		return Number(row?.item_count ?? 0);
	}

	async claimGuestOrders(user: CustomerPrincipal, guest: CustomerPrincipal): Promise<void> {
		if (user.kind !== "user" || guest.kind !== "guest") throw new TypeError("Guest orders can only be claimed by a registered user");
		const now = Date.now();
		await this.database.prepare(
			"UPDATE commerce_order SET user_id = ?, guest_id = NULL, version = version + 1, updated_at = ? WHERE guest_id = ?",
		).bind(user.id, now, guest.id).run();
	}
}
