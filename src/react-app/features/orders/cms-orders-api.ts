import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	cmsOrderListQuerySchema,
	orderDetailSchema,
	orderListResponseSchema,
	orderTransitionInputSchema,
	verifyDeliveryInputSchema,
	type CmsOrderListQuery,
	type OrderDetail,
	type OrderListResponse,
	type OrderTransitionInput,
	type VerifyDeliveryInput,
} from "../../../shared/contracts/order";
import { apiRequest } from "../../lib/api-client";

export const cmsOrderKeys = {
	list: (query: CmsOrderListQuery) => ["cms-orders", query] as const,
	detail: (orderNumber: string) => ["cms-order", orderNumber] as const,
	deliveries: ["cms-deliveries"] as const,
};

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown, label: string): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new Error(`The server returned an invalid ${label} response.`);
	return parsed.data;
}

function queryString(query: Record<string, unknown>) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) params.set(key, String(value));
	return params.toString();
}

async function requestCmsOrders(query: CmsOrderListQuery): Promise<OrderListResponse> {
	const body = await apiRequest<unknown>(`/api/cms/orders?${queryString(query)}`);
	return parse(orderListResponseSchema, body, "order list");
}

async function requestCmsOrder(orderNumber: string): Promise<OrderDetail> {
	const body = await apiRequest<unknown>(`/api/cms/orders/${encodeURIComponent(orderNumber)}`);
	return parse(orderDetailSchema, body, "order");
}

async function transitionOrder(orderNumber: string, input: OrderTransitionInput): Promise<OrderDetail> {
	const body = await apiRequest<unknown>(`/api/cms/orders/${encodeURIComponent(orderNumber)}/transition`, {
		method: "POST",
		body: orderTransitionInputSchema.parse(input),
	});
	return parse(orderDetailSchema, body, "order");
}

async function requestActiveDeliveries(): Promise<OrderListResponse> {
	const body = await apiRequest<unknown>("/api/cms/delivery/orders");
	return parse(orderListResponseSchema, body, "order list");
}

async function verifyDelivery(orderNumber: string, input: VerifyDeliveryInput): Promise<OrderDetail> {
	const body = await apiRequest<unknown>(`/api/cms/delivery/orders/${encodeURIComponent(orderNumber)}/verify`, {
		method: "POST",
		body: verifyDeliveryInputSchema.parse(input),
	});
	return parse(orderDetailSchema, body, "order");
}

export function useCmsOrders(queryValue: CmsOrderListQuery) {
	const query = cmsOrderListQuerySchema.parse(queryValue);
	return useQuery({ queryKey: cmsOrderKeys.list(query), queryFn: () => requestCmsOrders(query) });
}

export function useCmsOrder(orderNumber: string) {
	return useQuery({ queryKey: cmsOrderKeys.detail(orderNumber), queryFn: () => requestCmsOrder(orderNumber) });
}

export function useTransitionOrder() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ orderNumber, input }: { orderNumber: string; input: OrderTransitionInput }) =>
			transitionOrder(orderNumber, input),
		onSuccess: (order) => {
			client.setQueryData(cmsOrderKeys.detail(order.orderNumber), order);
			void client.invalidateQueries({ queryKey: ["cms-orders"] });
		},
	});
}

export function useActiveDeliveries() {
	return useQuery({ queryKey: cmsOrderKeys.deliveries, queryFn: requestActiveDeliveries });
}

export function useVerifyDelivery() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ orderNumber, input }: { orderNumber: string; input: VerifyDeliveryInput }) => verifyDelivery(orderNumber, input),
		onSuccess: () => void client.invalidateQueries({ queryKey: cmsOrderKeys.deliveries }),
	});
}
