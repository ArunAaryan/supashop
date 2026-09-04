import {
	cancelOrderInputSchema,
	checkoutInputSchema,
	orderDetailSchema,
	orderListQuerySchema,
	orderListResponseSchema,
	reorderResultSchema,
	type CheckoutInput,
	type Order,
	type OrderDetail,
	type OrderItem,
	type OrderStatusHistory,
	type ReorderLineResult,
} from "../../../shared/contracts/order";
import { evaluateFulfillmentAvailability } from "../../../shared/domain/fulfillment";
import { canCustomerCancelOrder } from "../../../shared/domain/order";
import type { CustomerPrincipal } from "../../auth/customer-principal";
import { ApiError } from "../../http/errors";
import { StoreRepository } from "../store/store-repository";
import {
	OrderRepository,
	type CheckoutCartState,
	type StoredCheckoutLine,
	type StoredOrder,
	type StoredOrderDetail,
} from "./order-repository";

function validate<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, value: unknown, message: string): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		throw new ApiError("VALIDATION_ERROR", message, {
			issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
		});
	}
	return parsed.data;
}

function toOrder(row: StoredOrder): Order {
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

function toDetail(row: StoredOrderDetail): OrderDetail {
	const items: OrderItem[] = row.items.map((item) => ({
		offeringId: item.offering_id,
		productId: item.product_id,
		productCode: item.product_code,
		productName: item.product_name,
		offeringSku: item.offering_sku,
		offeringLabel: item.offering_label,
		packQuantity: item.pack_quantity,
		weightValue: item.weight_value,
		weightUnit: item.weight_unit,
		listPriceMinor: item.list_price_minor,
		discountType: item.discount_type,
		discountValue: item.discount_value,
		effectiveUnitPriceMinor: item.effective_unit_price_minor,
		quantity: item.quantity,
		lineTotalMinor: item.line_total_minor,
	}));
	const history: OrderStatusHistory[] = row.history.map((entry) => ({
		id: entry.id,
		fromStatus: entry.from_status,
		toStatus: entry.to_status,
		reason: entry.reason,
		actorUserId: entry.actor_user_id,
		createdAt: entry.created_at,
	}));
	return orderDetailSchema.parse({
		...toOrder(row.order),
		itemCount: items.reduce((total, item) => total + item.quantity, 0),
		address: {
			orderId: row.address.order_id,
			recipientName: row.address.recipient_name,
			mobile: row.address.mobile,
			addressLine1: row.address.address_line_1,
			addressLine2: row.address.address_line_2 || null,
			landmark: row.address.landmark || null,
			city: row.address.city,
			state: row.address.state,
			postalCode: row.address.postal_code,
			latitude: row.address.latitude,
			longitude: row.address.longitude,
			deliveryInstructions: row.address.delivery_instructions || null,
		},
		items,
		statusHistory: history,
	});
}

function checkoutConflict(message: string, state: CheckoutCartState): never {
	throw new ApiError("CONFLICT", message, {
		affected: state.lines.map((line) => ({
			offeringId: line.offering_id,
			quantity: line.quantity,
			currentUnitPriceMinor: line.effective_unit_price_minor,
			offeringVersion: line.offering_version,
			availableStock: line.stock_quantity,
			active: Boolean(line.offering_active && line.product_active && line.category_active),
		})),
	});
}

function validateCheckoutCart(input: CheckoutInput, state: CheckoutCartState): StoredCheckoutLine[] {
	if (state.updatedAt !== input.cartUpdatedAt || state.lines.length !== input.expectedLines.length) {
		return checkoutConflict("Cart changed; review and retry", state);
	}
	const expected = new Map(input.expectedLines.map((line) => [line.offeringId, line]));
	for (const line of state.lines) {
		const requested = expected.get(line.offering_id);
		if (!requested || requested.quantity !== line.quantity || requested.expectedUnitPriceMinor !== line.effective_unit_price_minor || requested.offeringVersion !== line.offering_version) {
			return checkoutConflict("Cart prices or quantities changed; review and retry", state);
		}
		if (!line.offering_active || !line.product_active || !line.category_active || line.stock_quantity < line.quantity) {
			return checkoutConflict("One or more offerings are unavailable", state);
		}
	}
	return state.lines;
}

async function hashCheckout(input: CheckoutInput): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newOrderNumber() {
	return `ord_${crypto.randomUUID().replace(/-/g, "")}`;
}

function staleCheckoutError(error: unknown): boolean {
	return error instanceof Error && (
		/commerce_order_subtotal_check/i.test(error.message)
		|| /checkout_idempotency_owner_key_unique/i.test(error.message)
		|| /unique constraint failed: checkout_idempotency\.owner_key, checkout_idempotency\.idempotency_key/i.test(error.message)
	);
}

export class OrderService {
	constructor(
		private readonly repository: OrderRepository,
		private readonly stores: StoreRepository,
	) {}

	async checkout(owner: CustomerPrincipal, payload: unknown, idempotencyKey: string): Promise<{ order: OrderDetail; replayed: boolean }> {
		const input = validate(checkoutInputSchema, payload, "Checkout is invalid");
		if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
			throw new ApiError("VALIDATION_ERROR", "Idempotency-Key must be 8 to 128 URL-safe characters", {
				issues: [{ path: "Idempotency-Key", message: "Provide a valid Idempotency-Key header" }],
			});
		}
		if (input.saveAddress && owner.kind !== "user") {
			throw new ApiError("VALIDATION_ERROR", "Sign in to save a delivery address", {
				issues: [{ path: "saveAddress", message: "Guest checkout cannot save addresses" }],
			});
		}
		const requestHash = await hashCheckout(input);
		const previous = await this.repository.findIdempotency(owner, idempotencyKey);
		if (previous) {
			if (previous.request_hash !== requestHash) throw new ApiError("CONFLICT", "Idempotency key was already used with a different checkout");
			const replay = await this.repository.getOrderById(owner, previous.order_id);
			if (!replay) throw new Error("Idempotent checkout order is missing");
			return { order: toDetail(replay), replayed: true };
		}

		const store = await this.stores.getStore();
		const availability = evaluateFulfillmentAvailability(store && {
			timezone: store.timezone,
			orderCutoffMinutes: store.order_cutoff_minutes,
			hours: store.hours.map((hour) => ({
				weekday: hour.weekday,
				opensMinute: hour.opens_minute,
				closesMinute: hour.closes_minute,
				closed: Boolean(hour.closed),
			})),
			serviceablePostalCodes: store.serviceablePostalCodes,
			closures: store.closures,
		}, input.deliveryAddress.postalCode);
		if (!availability.available) {
			throw new ApiError("VALIDATION_ERROR", "Delivery is unavailable for this checkout", {
				issues: [{ path: "deliveryAddress.postalCode", message: availability.reason }],
			});
		}
		const state = await this.repository.getCheckoutCart(owner);
		const lines = validateCheckoutCart(input, state);
		const orderId = crypto.randomUUID();
		const orderNumber = newOrderNumber();
		try {
			await this.repository.commitCheckout({ orderId, orderNumber, owner, input, lines, requestHash, idempotencyKey });
		} catch (error) {
			const winner = await this.repository.findIdempotency(owner, idempotencyKey);
			if (winner) {
				if (winner.request_hash !== requestHash) throw new ApiError("CONFLICT", "Idempotency key was already used with a different checkout");
				const replay = await this.repository.getOrderById(owner, winner.order_id);
				if (!replay) throw new Error("Idempotent checkout order is missing");
				return { order: toDetail(replay), replayed: true };
			}
			if (staleCheckoutError(error)) checkoutConflict("Cart prices or availability changed; review and retry", await this.repository.getCheckoutCart(owner));
			throw error;
		}
		const detail = await this.repository.getOrder(owner, orderNumber);
		if (!detail) throw new Error("Checkout order could not be loaded");
		return { order: toDetail(detail), replayed: false };
	}

	async list(owner: CustomerPrincipal, queryValue: unknown) {
		const query = validate(orderListQuerySchema, queryValue, "Order query is invalid");
		const page = await this.repository.listOrders(owner, query.page, query.pageSize);
		return orderListResponseSchema.parse({
			items: page.items.map(toOrder),
			page: query.page,
			pageSize: query.pageSize,
			totalItems: page.totalItems,
			totalPages: Math.ceil(page.totalItems / query.pageSize),
		});
	}

	async detail(owner: CustomerPrincipal, orderNumber: string): Promise<OrderDetail> {
		const detail = await this.repository.getOrder(owner, orderNumber);
		if (!detail) throw new ApiError("NOT_FOUND", "Order not found");
		return toDetail(detail);
	}

	async cancel(owner: CustomerPrincipal, orderNumber: string, payload: unknown): Promise<OrderDetail> {
		const input = validate(cancelOrderInputSchema, payload, "Cancellation is invalid");
		const current = await this.repository.getOrder(owner, orderNumber);
		if (!current) throw new ApiError("NOT_FOUND", "Order not found");
		if (current.order.status === "cancelled") return toDetail(current);
		if (!canCustomerCancelOrder(current.order.status)) throw new ApiError("CONFLICT", "This order can no longer be cancelled");
		const stock = await this.repository.cancellationStock(current.order.id);
		try {
			const changed = await this.repository.cancel(owner, current, stock, input.reason);
			if (!changed) {
				const latest = await this.repository.getOrder(owner, orderNumber);
				if (latest?.order.status === "cancelled") return toDetail(latest);
				throw new ApiError("CONFLICT", "Order changed; reload and retry");
			}
		} catch (error) {
			const latest = await this.repository.getOrder(owner, orderNumber);
			if (latest?.order.status === "cancelled") return toDetail(latest);
			if (error instanceof ApiError) throw error;
			throw new ApiError("CONFLICT", "Order changed; reload and retry");
		}
		const cancelled = await this.repository.getOrder(owner, orderNumber);
		if (!cancelled) throw new Error("Cancelled order could not be loaded");
		return toDetail(cancelled);
	}

	async reorder(owner: CustomerPrincipal, orderNumber: string) {
		const order = await this.repository.getOrder(owner, orderNumber);
		if (!order) throw new ApiError("NOT_FOUND", "Order not found");
		const snapshot = await this.repository.reorderSnapshot(owner, order.order.id);
		const results: ReorderLineResult[] = [];
		const additions: Array<{ offeringId: string; quantity: number; unitPriceMinor: number }> = [];
		for (const line of snapshot) {
			const requestedQuantity = line.quantity;
			if (!line.offering_active || !line.product_active || !line.category_active || line.current_effective_price_minor === null) {
				results.push({ offeringId: line.offering_id, requestedQuantity, addedQuantity: 0, status: "unavailable" });
				continue;
			}
			if (!line.stock_quantity) {
				results.push({ offeringId: line.offering_id, requestedQuantity, addedQuantity: 0, status: "out_of_stock" });
				continue;
			}
			const cartQuantity = line.cart_quantity ?? 0;
			const quantityCapacity = 99 - cartQuantity;
			if (quantityCapacity <= 0) {
				results.push({ offeringId: line.offering_id, requestedQuantity, addedQuantity: 0, status: "quantity_limit" });
				continue;
			}
			const stockCapacity = line.stock_quantity - cartQuantity;
			if (stockCapacity <= 0) {
				results.push({ offeringId: line.offering_id, requestedQuantity, addedQuantity: 0, status: "insufficient_stock" });
				continue;
			}
			const addedQuantity = Math.min(requestedQuantity, quantityCapacity, stockCapacity);
			additions.push({ offeringId: line.offering_id, quantity: addedQuantity, unitPriceMinor: line.current_effective_price_minor });
			results.push({ offeringId: line.offering_id, requestedQuantity, addedQuantity, status: "added" });
		}
		const cartItemCount = await this.repository.addReorderLines(owner, additions);
		return reorderResultSchema.parse({ cartItemCount, lines: results });
	}
}
