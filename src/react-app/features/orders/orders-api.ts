import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	cancelOrderInputSchema,
	cancelOrderResponseSchema,
	customerAddressInputSchema,
	customerAddressSchema,
	orderDetailSchema,
	orderListQuerySchema,
	orderListResponseSchema,
	reorderResultSchema,
	updateCustomerAddressInputSchema,
	type CancelOrderInput,
	type CustomerAddressInput,
	type OrderDetail,
	type OrderListQuery,
	type OrderListResponse,
	type UpdateCustomerAddressInput,
} from "../../../shared/contracts/order";
import { apiRequest } from "../../lib/api-client";

export const orderKeys = {
	addresses: ["addresses"] as const,
	list: (query: OrderListQuery) => ["orders", query] as const,
	detail: (orderNumber: string) => ["order", orderNumber] as const,
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

async function requestAddresses() {
	return parse(customerAddressSchema.array(), await apiRequest<unknown>("/api/addresses"), "address list");
}

async function createAddress(input: CustomerAddressInput) {
	return parse(customerAddressSchema, await apiRequest<unknown>("/api/addresses", { method: "POST", body: customerAddressInputSchema.parse(input) }), "saved address");
}

async function updateAddress(id: string, input: UpdateCustomerAddressInput) {
	return parse(customerAddressSchema, await apiRequest<unknown>(`/api/addresses/${encodeURIComponent(id)}`, { method: "PUT", body: updateCustomerAddressInputSchema.parse(input) }), "saved address");
}

async function deleteAddress({ id, version }: { id: string; version: number }) {
	await apiRequest<undefined>(`/api/addresses/${encodeURIComponent(id)}`, { method: "DELETE", body: { version } });
}

async function requestOrders(query: OrderListQuery): Promise<OrderListResponse> {
	return parse(orderListResponseSchema, await apiRequest<unknown>(`/api/orders?${queryString(query)}`), "order history");
}

async function requestOrder(orderNumber: string): Promise<OrderDetail> {
	return parse(orderDetailSchema, await apiRequest<unknown>(`/api/orders/${encodeURIComponent(orderNumber)}`), "order");
}

async function cancelOrder(orderNumber: string, input: CancelOrderInput): Promise<OrderDetail> {
	return parse(cancelOrderResponseSchema, await apiRequest<unknown>(`/api/orders/${encodeURIComponent(orderNumber)}/cancel`, { method: "POST", body: cancelOrderInputSchema.parse(input) }), "cancelled order");
}

async function reorder(orderNumber: string) {
	return parse(reorderResultSchema, await apiRequest<unknown>(`/api/orders/${encodeURIComponent(orderNumber)}/reorder`, { method: "POST" }), "reorder");
}

export function useCustomerAddresses(enabled = true) {
	return useQuery({ queryKey: orderKeys.addresses, queryFn: requestAddresses, retry: false, enabled });
}

export function useCreateCustomerAddress() {
	const client = useQueryClient();
	return useMutation({ mutationFn: createAddress, onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.addresses }) });
}

export function useUpdateCustomerAddress() {
	const client = useQueryClient();
	return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateCustomerAddressInput }) => updateAddress(id, input), onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.addresses }) });
}

export function useDeleteCustomerAddress() {
	const client = useQueryClient();
	return useMutation({ mutationFn: deleteAddress, onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.addresses }) });
}

export function useOrders(query: OrderListQuery) {
	const parsed = orderListQuerySchema.parse(query);
	return useQuery({ queryKey: orderKeys.list(parsed), queryFn: () => requestOrders(parsed), retry: false });
}

export function useOrder(orderNumber: string) {
	return useQuery({ queryKey: orderKeys.detail(orderNumber), queryFn: () => requestOrder(orderNumber), retry: false });
}

export function useCancelOrder() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ orderNumber, input }: { orderNumber: string; input: CancelOrderInput }) => cancelOrder(orderNumber, input),
		onSuccess: (order) => {
			client.setQueryData(orderKeys.detail(order.orderNumber), order);
			void client.invalidateQueries({ queryKey: ["orders"] });
		},
	});
}

export function useReorder() {
	return useMutation({ mutationFn: reorder });
}
