import type { StoredOrder } from "../orders/order-repository";

type CountRow = { total?: number };
type RevenueRow = { revenue?: number; total?: number };
type UnitsRow = { units?: number };
type TopOfferingRow = { offering_id: string; product_name: string; offering_label: string; units_sold: number };
type LowStockRow = { offering_id: string; product_name: string; offering_label: string; stock_quantity: number; low_stock_threshold: number };

export type AnalyticsOverviewData = {
	ordersToday: number;
	ordersThisWeek: number;
	deliveredRevenueMinor: number;
	deliveredCount: number;
	unitsSold: number;
	cancellationCount: number;
	topOfferings: TopOfferingRow[];
	lowStock: LowStockRow[];
	queue: StoredOrder[];
};

const orderColumns = `id, order_number, status, payment_status, currency, subtotal_minor, delivery_fee_minor, total_minor, placed_at, expected_delivery_at, cancelled_at, version,
	(SELECT COALESCE(sum(quantity), 0) FROM order_item i WHERE i.order_id = o.id) AS item_count`;

export class AnalyticsRepository {
	constructor(private readonly database: D1Database) {}

	async overview(startToday: number, startWeek: number): Promise<AnalyticsOverviewData> {
		const results = await this.database.batch([
			this.database.prepare("SELECT count(*) AS total FROM commerce_order WHERE placed_at >= ?").bind(startToday),
			this.database.prepare("SELECT count(*) AS total FROM commerce_order WHERE placed_at >= ?").bind(startWeek),
			this.database.prepare("SELECT COALESCE(sum(total_minor), 0) AS revenue, count(*) AS total FROM commerce_order WHERE status = 'delivered' AND placed_at >= ?").bind(startWeek),
			this.database.prepare("SELECT COALESCE(sum(oi.quantity), 0) AS units FROM order_item oi JOIN commerce_order o ON o.id = oi.order_id WHERE o.status = 'delivered' AND o.placed_at >= ?").bind(startWeek),
			this.database.prepare("SELECT count(*) AS total FROM commerce_order WHERE status = 'cancelled' AND placed_at >= ?").bind(startWeek),
			this.database.prepare(
				`SELECT oi.offering_id, p.name AS product_name, o.label AS offering_label, sum(oi.quantity) AS units_sold
				 FROM order_item oi
				 JOIN commerce_order co ON co.id = oi.order_id
				 JOIN offering o ON o.id = oi.offering_id
				 JOIN product p ON p.id = oi.product_id
				 WHERE co.status = 'delivered' AND co.placed_at >= ?
				 GROUP BY oi.offering_id, p.name, o.label
				 ORDER BY units_sold DESC LIMIT 5`,
			).bind(startWeek),
			this.database.prepare(
				`SELECT o.id AS offering_id, p.name AS product_name, o.label AS offering_label, o.stock_quantity, o.low_stock_threshold
				 FROM offering o
				 JOIN product p ON p.id = o.product_id
				 WHERE o.active = 1 AND o.stock_quantity <= o.low_stock_threshold
				 ORDER BY o.stock_quantity ASC LIMIT 10`,
			),
			this.database.prepare(
				`SELECT ${orderColumns} FROM commerce_order o WHERE o.status IN ('placed', 'confirmed') ORDER BY o.placed_at DESC, o.id DESC LIMIT 8`,
			),
		]);

		return {
			ordersToday: Number((results[0].results[0] as CountRow | undefined)?.total ?? 0),
			ordersThisWeek: Number((results[1].results[0] as CountRow | undefined)?.total ?? 0),
			deliveredRevenueMinor: Number((results[2].results[0] as RevenueRow | undefined)?.revenue ?? 0),
			deliveredCount: Number((results[2].results[0] as RevenueRow | undefined)?.total ?? 0),
			unitsSold: Number((results[3].results[0] as UnitsRow | undefined)?.units ?? 0),
			cancellationCount: Number((results[4].results[0] as CountRow | undefined)?.total ?? 0),
			topOfferings: results[5].results as TopOfferingRow[],
			lowStock: results[6].results as LowStockRow[],
			queue: results[7].results as StoredOrder[],
		};
	}
}
