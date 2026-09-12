import {
	analyticsOverviewResponseSchema,
	type AnalyticsOverviewResponse,
} from "../../../shared/contracts/analytics";
import { canCustomerCancelOrder } from "../../../shared/domain/order";
import type { StoredOrder } from "../orders/order-repository";
import { StoreRepository } from "../store/store-repository";
import { AnalyticsRepository } from "./analytics-repository";
import { startOfLocalDayUtc } from "./timezone";

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

function toOrder(row: StoredOrder) {
	return {
		id: row.id,
		orderNumber: row.order_number,
		status: row.status,
		paymentStatus: row.payment_status,
		currency: row.currency,
		subtotalMinor: row.subtotal_minor,
		deliveryFeeMinor: row.delivery_fee_minor,
		totalMinor: row.total_minor,
		itemCount: row.item_count,
		placedAt: row.placed_at,
		expectedDeliveryAt: row.expected_delivery_at,
		cancelledAt: row.cancelled_at,
		customerCanCancel: canCustomerCancelOrder(row.status),
		version: row.version,
	};
}

export class AnalyticsService {
	constructor(
		private readonly repository: AnalyticsRepository,
		private readonly stores: StoreRepository,
	) {}

	async overview(): Promise<AnalyticsOverviewResponse> {
		const store = await this.stores.getStore();
		const timezone = store?.timezone ?? "UTC";
		const now = Date.now();
		const startToday = startOfLocalDayUtc(timezone, new Date(now));
		const startWeek = startToday - SIX_DAYS_MS;
		const data = await this.repository.overview(startToday, startWeek);

		const averageOrderValueMinor = data.deliveredCount > 0
			? Math.floor(data.deliveredRevenueMinor / data.deliveredCount)
			: 0;
		const cancellationRateBasisPoints = data.ordersThisWeek > 0
			? Math.round((data.cancellationCount / data.ordersThisWeek) * 10_000)
			: 0;

		return analyticsOverviewResponseSchema.parse({
			overview: {
				ordersToday: data.ordersToday,
				ordersThisWeek: data.ordersThisWeek,
				deliveredRevenueMinor: data.deliveredRevenueMinor,
				unitsSold: data.unitsSold,
				averageOrderValueMinor,
				deliveredCount: data.deliveredCount,
				cancellationCount: data.cancellationCount,
				cancellationRateBasisPoints,
			},
			topOfferings: data.topOfferings.map((row) => ({
				offeringId: row.offering_id,
				productName: row.product_name,
				offeringLabel: row.offering_label,
				unitsSold: Number(row.units_sold),
			})),
			lowStock: data.lowStock.map((row) => ({
				offeringId: row.offering_id,
				productName: row.product_name,
				offeringLabel: row.offering_label,
				stockQuantity: Number(row.stock_quantity),
				lowStockThreshold: Number(row.low_stock_threshold),
			})),
			queue: data.queue.map(toOrder),
		});
	}
}
