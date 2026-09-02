import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	addCartItemInputSchema,
	cartResponseSchema,
	setCartItemInputSchema,
	type AddCartItemInput,
	type CartResponse,
	type SetCartItemInput,
} from "../../../shared/contracts/cart";
import { guestSessionResponseSchema } from "../../../shared/contracts/guest";
import { ApiClientError, apiRequest } from "../../lib/api-client";

export const cartKeys = {
	cart: ["cart"] as const,
};

function parseCart(value: unknown): CartResponse {
	const parsed = cartResponseSchema.safeParse(value);
	if (!parsed.success) throw new Error("The server returned an invalid cart response.");
	return parsed.data;
}

async function requestCart(): Promise<CartResponse> {
	return parseCart(await apiRequest<unknown>("/api/cart"));
}

export async function mergeGuestCart(): Promise<CartResponse> {
	return parseCart(await apiRequest<unknown>("/api/cart/merge", { method: "POST" }));
}

async function createGuestSession(): Promise<void> {
	const body = await apiRequest<unknown>("/api/guest/session", { method: "POST" });
	if (!guestSessionResponseSchema.safeParse(body).success) {
		throw new Error("We could not start a guest cart. Please try again.");
	}
}

async function addItem(input: AddCartItemInput, mayCreateGuest = true): Promise<CartResponse> {
	try {
		return parseCart(await apiRequest<unknown>("/api/cart/items", { method: "POST", body: addCartItemInputSchema.parse(input) }));
	} catch (error) {
		if (mayCreateGuest && error instanceof ApiClientError && error.status === 401) {
			await createGuestSession();
			return addItem(input, false);
		}
		throw error;
	}
}

async function setItem(offeringId: string, input: SetCartItemInput): Promise<CartResponse> {
	return parseCart(await apiRequest<unknown>(`/api/cart/items/${encodeURIComponent(offeringId)}`, { method: "PUT", body: setCartItemInputSchema.parse(input) }));
}

async function removeItem(offeringId: string): Promise<void> {
	await apiRequest<undefined>(`/api/cart/items/${encodeURIComponent(offeringId)}`, { method: "DELETE" });
}

function withoutLine(cart: CartResponse, offeringId: string): CartResponse {
	const lines = cart.lines.filter((line) => line.offeringId !== offeringId);
	return cartResponseSchema.parse({
		...cart,
		lines,
		itemCount: lines.reduce((total, line) => total + line.quantity, 0),
		subtotalMinor: lines.reduce((total, line) => total + line.lineTotalMinor, 0),
		requiresReview: lines.some((line) => line.priceChanged || line.availability !== "available"),
	});
}

export function useCart() {
	return useQuery({ queryKey: cartKeys.cart, queryFn: requestCart, retry: false });
}

export function useAddCartItem() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (input: AddCartItemInput) => addItem(input),
		onSuccess: (cart) => client.setQueryData(cartKeys.cart, cart),
		onError: () => client.invalidateQueries({ queryKey: cartKeys.cart }),
	});
}

export function useSetCartItem() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ offeringId, input }: { offeringId: string; input: SetCartItemInput }) => setItem(offeringId, input),
		onSuccess: (cart) => client.setQueryData(cartKeys.cart, cart),
		onError: () => client.invalidateQueries({ queryKey: cartKeys.cart }),
	});
}

export function useRemoveCartItem() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: removeItem,
		onSuccess: (_, offeringId) => client.setQueryData<CartResponse>(cartKeys.cart, (cart) => cart ? withoutLine(cart, offeringId) : cart),
		onError: () => client.invalidateQueries({ queryKey: cartKeys.cart }),
	});
}
