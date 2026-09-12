import { z } from "zod";

import { orderSchema } from "./order";

const nonnegativeInt = z.number().int().nonnegative();

export const analyticsOverviewSchema = z
	.object({
		ordersToday: nonnegativeInt,
		ordersThisWeek: nonnegativeInt,
		deliveredRevenueMinor: nonnegativeInt,
		unitsSold: nonnegativeInt,
		averageOrderValueMinor: nonnegativeInt,
		deliveredCount: nonnegativeInt,
		cancellationCount: nonnegativeInt,
		cancellationRateBasisPoints: nonnegativeInt,
	})
	.strict();

export const topOfferingSchema = z
	.object({
		offeringId: z.string().trim().min(1).max(100),
		productName: z.string().trim().min(1).max(120),
		offeringLabel: z.string().trim().min(1).max(120),
		unitsSold: nonnegativeInt,
	})
	.strict();

export const lowStockOfferingSchema = z
	.object({
		offeringId: z.string().trim().min(1).max(100),
		productName: z.string().trim().min(1).max(120),
		offeringLabel: z.string().trim().min(1).max(120),
		stockQuantity: nonnegativeInt,
		lowStockThreshold: nonnegativeInt,
	})
	.strict();

export const analyticsOverviewResponseSchema = z
	.object({
		overview: analyticsOverviewSchema,
		topOfferings: z.array(topOfferingSchema),
		lowStock: z.array(lowStockOfferingSchema),
		queue: z.array(orderSchema),
	})
	.strict();

export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;
export type AnalyticsOverviewResponse = z.infer<typeof analyticsOverviewResponseSchema>;
