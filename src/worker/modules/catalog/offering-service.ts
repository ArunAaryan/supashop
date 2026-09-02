import {
	catalogListResponseSchema,
	cmsInventoryMovementListQuerySchema,
	cmsOfferingListQuerySchema,
	inventoryAdjustmentInputSchema,
	inventoryMovementSchema,
	offeringCreateInputSchema,
	offeringSchema,
	offeringUpdateInputSchema,
	type CatalogListResponse,
	type InventoryMovement,
	type Offering,
} from "../../../shared/contracts/catalog";
import { calculateEffectivePrice } from "../../../shared/domain/discount";
import { ApiError } from "../../http/errors";
import { OfferingRepository, type StoredMovement, type StoredOffering } from "./offering-repository";

function validation<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, value: unknown, message: string): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new ApiError("VALIDATION_ERROR", message, { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
	return parsed.data;
}

export function offeringFromRow(row: StoredOffering): Offering {
	const price = calculateEffectivePrice(row.list_price_minor, row.discount_type, row.discount_value);
	return offeringSchema.parse({
		id: row.id, productId: row.product_id, sku: row.sku, label: row.label,
		packQuantity: row.pack_quantity, weightValue: row.weight_value, weightUnit: row.weight_unit,
		listPriceMinor: row.list_price_minor, discountType: row.discount_type, discountValue: row.discount_value,
		...price, stockQuantity: row.stock_quantity, lowStockThreshold: row.low_stock_threshold,
		inStock: row.stock_quantity > 0, lowStock: row.stock_quantity <= row.low_stock_threshold,
		active: Boolean(row.active), version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
	});
}

function movementFromRow(row: StoredMovement): InventoryMovement {
	return inventoryMovementSchema.parse({
		id: row.id, offeringId: row.offering_id, previousQuantity: row.previous_quantity,
		quantityDelta: row.quantity_delta, resultingQuantity: row.resulting_quantity, reason: row.reason,
		movementType: row.movement_type, actorUserId: row.actor_user_id,
		offeringVersion: row.offering_version, createdAt: row.created_at,
	});
}

function unique(error: unknown): boolean {
	return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export class OfferingService {
	constructor(private readonly repository: OfferingRepository) {}

	async listOfferings(queryValue: unknown): Promise<CatalogListResponse<Offering>> {
		const query = validation(cmsOfferingListQuerySchema, queryValue, "Offering query is invalid");
		const page = await this.repository.listOfferings(query);
		return catalogListResponseSchema(offeringSchema).parse({ items: page.items.map(offeringFromRow), page: query.page, pageSize: query.pageSize, totalItems: page.totalItems, totalPages: Math.ceil(page.totalItems / query.pageSize) });
	}

	async getOffering(id: string): Promise<Offering> {
		const row = await this.repository.getOffering(id);
		if (!row) throw new ApiError("NOT_FOUND", "Offering not found");
		return offeringFromRow(row);
	}

	async createOffering(payload: unknown): Promise<Offering> {
		const input = validation(offeringCreateInputSchema, payload, "Offering is invalid");
		if (!await this.repository.productExists(input.productId)) throw new ApiError("NOT_FOUND", "Product not found");
		try { return offeringFromRow(await this.repository.createOffering(input)); }
		catch (error) { if (unique(error)) throw new ApiError("CONFLICT", "Offering SKU already exists"); throw error; }
	}

	async updateOffering(id: string, payload: unknown): Promise<Offering> {
		const input = validation(offeringUpdateInputSchema, payload, "Offering is invalid");
		const current = await this.repository.getOffering(id);
		if (!current) throw new ApiError("NOT_FOUND", "Offering not found");
		if (!input.active && Boolean(current.active) && await this.repository.productIsActive(current.product_id) && await this.repository.countActiveOfferings(current.product_id, id) === 0) {
			throw new ApiError("CONFLICT", "Deactivate the product or activate another offering first");
		}
		try {
			if (!await this.repository.updateOffering(id, input)) throw new ApiError("CONFLICT", "Offering changed; reload and retry");
			return this.getOffering(id);
		} catch (error) { if (unique(error)) throw new ApiError("CONFLICT", "Offering SKU already exists"); throw error; }
	}

	async adjustInventory(id: string, payload: unknown, actorUserId: string): Promise<{ offering: Offering; movement: InventoryMovement }> {
		const input = validation(inventoryAdjustmentInputSchema, payload, "Inventory adjustment is invalid");
		const current = await this.repository.getOffering(id);
		if (!current) throw new ApiError("NOT_FOUND", "Offering not found");
		if (current.version !== input.version) throw new ApiError("CONFLICT", "Offering changed; reload and retry");
		if (current.stock_quantity === input.stockQuantity) throw new ApiError("VALIDATION_ERROR", "Inventory adjustment must change stock", { issues: [{ path: "stockQuantity", message: "Enter a different stock quantity" }] });
		const result = await this.repository.adjustInventory(id, input.stockQuantity, current.stock_quantity, input.version, input.reason, actorUserId);
		if (!result.changed) throw new ApiError("CONFLICT", "Offering changed; reload and retry");
		const [offering, movement] = await Promise.all([this.repository.getOffering(id), this.repository.getMovement(result.movementId)]);
		if (!offering || !movement) throw new Error("Inventory adjustment could not be loaded");
		return { offering: offeringFromRow(offering), movement: movementFromRow(movement) };
	}

	async listMovements(queryValue: unknown): Promise<CatalogListResponse<InventoryMovement>> {
		const query = validation(cmsInventoryMovementListQuerySchema, queryValue, "Inventory movement query is invalid");
		const page = await this.repository.listMovements(query);
		return catalogListResponseSchema(inventoryMovementSchema).parse({ items: page.items.map(movementFromRow), page: query.page, pageSize: query.pageSize, totalItems: page.totalItems, totalPages: Math.ceil(page.totalItems / query.pageSize) });
	}
}
