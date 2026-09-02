import {
	addCartItemInputSchema,
	cartResponseSchema,
	setCartItemInputSchema,
	type CartLine,
	type CartResponse,
} from "../../../shared/contracts/cart";
import { ApiError } from "../../http/errors";
import { CartRepository, currentEffectivePrice, type CartOwner, type StoredCartLine, type StoredOfferingForCart } from "./cart-repository";

function validate<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, value: unknown, message: string): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new ApiError("VALIDATION_ERROR", message, { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
	return parsed.data;
}

function availability(row: Pick<StoredCartLine, "offering_active" | "product_active" | "category_active" | "stock_quantity" | "quantity">): CartLine["availability"] {
	if (!row.offering_active || !row.product_active || !row.category_active) return "unavailable";
	if (row.stock_quantity === 0) return "out_of_stock";
	if (row.stock_quantity < row.quantity) return "insufficient_stock";
	return "available";
}

function canIncrease(row: StoredOfferingForCart, quantity: number) {
	return Boolean(row.offering_active && row.product_active && row.category_active && row.stock_quantity >= quantity);
}

function line(row: StoredCartLine): CartLine {
	const currentUnitPriceMinor = currentEffectivePrice(row);
	const status = availability(row);
	return {
		offeringId: row.offering_id,
		productId: row.product_id,
		productSlug: row.product_slug,
		productName: row.product_name,
		offeringLabel: row.offering_label,
		imageUrl: row.image_url,
		quantity: row.quantity,
		lineVersion: row.line_version,
		unitPriceMinorAtAdd: row.effective_price_minor_at_add,
		currentUnitPriceMinor,
		lineTotalMinor: currentUnitPriceMinor * row.quantity,
		priceChanged: row.effective_price_minor_at_add !== currentUnitPriceMinor,
		availableStock: row.stock_quantity,
		availability: status,
	};
}

export class CartService {
	constructor(private readonly repository: CartRepository) {}

	async getCart(owner: CartOwner): Promise<CartResponse> {
		await this.repository.ensureCart(owner);
		const [cart, rows] = await Promise.all([this.repository.getCart(owner), this.repository.getLines(owner)]);
		const lines = rows.map(line);
		return cartResponseSchema.parse({
			lines,
			itemCount: lines.reduce((total, item) => total + item.quantity, 0),
			subtotalMinor: lines.reduce((total, item) => total + item.lineTotalMinor, 0),
			requiresReview: lines.some((item) => item.priceChanged || item.availability !== "available"),
			updatedAt: cart?.updated_at ?? null,
		});
	}

	async addItem(owner: CartOwner, value: unknown): Promise<{ cart: CartResponse; created: boolean }> {
		const input = validate(addCartItemInputSchema, value, "Cart item is invalid");
		await this.repository.ensureCart(owner);
		const [existing, offering] = await Promise.all([this.repository.getItem(owner, input.offeringId), this.repository.getOffering(input.offeringId)]);
		if (!offering) throw new ApiError("NOT_FOUND", "Offering not found");
		const quantity = (existing?.quantity ?? 0) + input.quantity;
		if (quantity > 99) throw new ApiError("VALIDATION_ERROR", "Cart quantity cannot exceed 99", { issues: [{ path: "quantity", message: "Quantity cannot exceed 99" }] });
		if (!canIncrease(offering, quantity)) throw new ApiError("CONFLICT", "Offering is unavailable");

		if (existing) {
			if (!await this.repository.updateItem(owner, input.offeringId, quantity, existing.version)) throw new ApiError("CONFLICT", "Cart changed; reload and retry");
			return { cart: await this.getCart(owner), created: false };
		}
		try {
			if (!await this.repository.insertItem(owner, input.offeringId, quantity, currentEffectivePrice(offering))) throw new ApiError("CONFLICT", "Cart changed; reload and retry");
		} catch (error) {
			if (error instanceof ApiError) throw error;
			if (error instanceof Error && /unique constraint failed/i.test(error.message)) throw new ApiError("CONFLICT", "Cart changed; reload and retry");
			throw error;
		}
		return { cart: await this.getCart(owner), created: true };
	}

	async setItem(owner: CartOwner, offeringId: string, value: unknown): Promise<CartResponse> {
		const input = validate(setCartItemInputSchema, value, "Cart item is invalid");
		await this.repository.ensureCart(owner);
		const [existing, offering] = await Promise.all([this.repository.getItem(owner, offeringId), this.repository.getOffering(offeringId)]);
		if (!offering) throw new ApiError("NOT_FOUND", "Offering not found");
		if (!existing) {
			if (!canIncrease(offering, input.quantity)) throw new ApiError("CONFLICT", "Offering is unavailable");
			try {
				await this.repository.insertItem(owner, offeringId, input.quantity, currentEffectivePrice(offering));
			} catch (error) {
				if (error instanceof Error && /unique constraint failed/i.test(error.message)) throw new ApiError("CONFLICT", "Cart changed; reload and retry");
				throw error;
			}
			return this.getCart(owner);
		}
		if (input.quantity > existing.quantity && !canIncrease(offering, input.quantity)) throw new ApiError("CONFLICT", "Offering is unavailable");
		if (input.quantity !== existing.quantity && !await this.repository.updateItem(owner, offeringId, input.quantity, existing.version)) throw new ApiError("CONFLICT", "Cart changed; reload and retry");
		return this.getCart(owner);
	}

	async removeItem(owner: CartOwner, offeringId: string): Promise<void> {
		await this.repository.ensureCart(owner);
		if (!await this.repository.deleteItem(owner, offeringId)) throw new ApiError("NOT_FOUND", "Cart item not found");
	}

	async merge(registered: CartOwner, guest: CartOwner): Promise<CartResponse> {
		try {
			await this.repository.merge(registered, guest);
		} catch (error) {
			if (error instanceof Error && /cart_item_quantity_check/i.test(error.message)) {
				throw new ApiError("CONFLICT", "Guest cart merge exceeds the maximum quantity");
			}
			throw error;
		}
		return this.getCart(registered);
	}
}
