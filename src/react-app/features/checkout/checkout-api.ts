import { useMutation, useQueryClient } from "@tanstack/react-query";

import { checkoutInputSchema, orderDetailSchema, type CheckoutInput, type OrderDetail } from "../../../shared/contracts/order";
import { apiRequest } from "../../lib/api-client";
import { cartKeys } from "../cart/cart-api";
import { orderKeys } from "../orders/orders-api";

function parseOrder(value: unknown): OrderDetail {
	const parsed = orderDetailSchema.safeParse(value);
	if (!parsed.success) throw new Error("The server returned an invalid checkout response.");
	return parsed.data;
}

export async function placeOrder(input: CheckoutInput, idempotencyKey: string): Promise<OrderDetail> {
	return parseOrder(await apiRequest<unknown>("/api/checkout", {
		method: "POST",
		headers: { "Idempotency-Key": idempotencyKey },
		body: checkoutInputSchema.parse(input),
	}));
}

export function usePlaceOrder() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ input, idempotencyKey }: { input: CheckoutInput; idempotencyKey: string }) => placeOrder(input, idempotencyKey),
		onSuccess: (order) => {
			client.setQueryData(orderKeys.detail(order.orderNumber), order);
			void client.invalidateQueries({ queryKey: cartKeys.cart });
			void client.invalidateQueries({ queryKey: ["orders"] });
		},
	});
}
