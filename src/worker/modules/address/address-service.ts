import {
	customerAddressInputSchema,
	customerAddressSchema,
	deleteCustomerAddressInputSchema,
	updateCustomerAddressInputSchema,
	type CustomerAddress,
} from "../../../shared/contracts/order";
import { ApiError } from "../../http/errors";
import { AddressRepository, type StoredCustomerAddress } from "./address-repository";

function validate<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, value: unknown, message: string): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		throw new ApiError("VALIDATION_ERROR", message, {
			issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
		});
	}
	return parsed.data;
}

function toAddress(row: StoredCustomerAddress): CustomerAddress {
	return customerAddressSchema.parse({
		id: row.id,
		label: row.label || null,
		recipientName: row.recipient_name,
		mobile: row.mobile,
		addressLine1: row.address_line_1,
		addressLine2: row.address_line_2 || null,
		landmark: row.landmark || null,
		city: row.city,
		state: row.state,
		postalCode: row.postal_code,
		latitude: row.latitude,
		longitude: row.longitude,
		deliveryInstructions: row.delivery_instructions || null,
		isDefault: Boolean(row.is_default),
		version: row.version,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
}

export class AddressService {
	constructor(private readonly repository: AddressRepository) {}

	async list(userId: string): Promise<CustomerAddress[]> {
		return (await this.repository.list(userId)).map(toAddress);
	}

	async get(userId: string, id: string): Promise<CustomerAddress> {
		const address = await this.repository.get(userId, id);
		if (!address) throw new ApiError("NOT_FOUND", "Address not found");
		return toAddress(address);
	}

	async create(userId: string, payload: unknown): Promise<CustomerAddress> {
		return toAddress(await this.repository.create(userId, validate(customerAddressInputSchema, payload, "Address is invalid")));
	}

	async update(userId: string, id: string, payload: unknown): Promise<CustomerAddress> {
		const input = validate(updateCustomerAddressInputSchema, payload, "Address is invalid");
		if (await this.repository.update(userId, id, input)) return this.get(userId, id);
		if (await this.repository.get(userId, id)) throw new ApiError("CONFLICT", "Address changed; reload and retry");
		throw new ApiError("NOT_FOUND", "Address not found");
	}

	async delete(userId: string, id: string, payload: unknown): Promise<void> {
		const input = validate(deleteCustomerAddressInputSchema, payload, "Address deletion is invalid");
		if (await this.repository.delete(userId, id, input.version)) return;
		if (await this.repository.get(userId, id)) throw new ApiError("CONFLICT", "Address changed; reload and retry");
		throw new ApiError("NOT_FOUND", "Address not found");
	}
}
