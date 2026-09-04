import type {
	CustomerAddressInput,
	UpdateCustomerAddressInput,
} from "../../../shared/contracts/order";

export type StoredCustomerAddress = {
	id: string;
	label: string;
	recipient_name: string;
	mobile: string;
	address_line_1: string;
	address_line_2: string;
	landmark: string;
	city: string;
	state: string;
	postal_code: string;
	latitude: number | null;
	longitude: number | null;
	delivery_instructions: string;
	is_default: number;
	version: number;
	created_at: number;
	updated_at: number;
};

const columns = "id, label, recipient_name, mobile, address_line_1, address_line_2, landmark, city, state, postal_code, latitude, longitude, delivery_instructions, is_default, version, created_at, updated_at";

function nullableText(value: string | null): string {
	return value ?? "";
}

function inputValues(input: CustomerAddressInput | UpdateCustomerAddressInput) {
	return [
		nullableText(input.label),
		input.recipientName,
		input.mobile,
		input.addressLine1,
		nullableText(input.addressLine2),
		nullableText(input.landmark),
		input.city,
		input.state,
		input.postalCode,
		input.latitude,
		input.longitude,
		nullableText(input.deliveryInstructions),
	] as const;
}

export class AddressRepository {
	constructor(private readonly database: D1Database) {}

	async list(userId: string): Promise<StoredCustomerAddress[]> {
		const result = await this.database.prepare(
			`SELECT ${columns} FROM customer_address WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC, id ASC`,
		).bind(userId).all<StoredCustomerAddress>();
		return result.results;
	}

	async get(userId: string, id: string): Promise<StoredCustomerAddress | null> {
		return this.database.prepare(
			`SELECT ${columns} FROM customer_address WHERE user_id = ? AND id = ?`,
		).bind(userId, id).first<StoredCustomerAddress>();
	}

	async create(userId: string, input: CustomerAddressInput): Promise<StoredCustomerAddress> {
		const id = crypto.randomUUID();
		const now = Date.now();
		const statements: D1PreparedStatement[] = [];
		if (input.isDefault) {
			statements.push(
				this.database.prepare("UPDATE customer_address SET is_default = 0 WHERE user_id = ? AND is_default = 1")
					.bind(userId),
			);
		}
		statements.push(
			this.database.prepare(
				"INSERT INTO customer_address (id, user_id, label, recipient_name, mobile, address_line_1, address_line_2, landmark, city, state, postal_code, latitude, longitude, delivery_instructions, is_default, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
			).bind(id, userId, ...inputValues(input), input.isDefault ? 1 : 0, now, now),
		);
		if (!input.isDefault) {
			statements.push(
				this.database.prepare(
					"UPDATE customer_address SET is_default = 1 WHERE id = ? AND user_id = ? AND NOT EXISTS (SELECT 1 FROM customer_address WHERE user_id = ? AND is_default = 1)",
				).bind(id, userId, userId),
			);
		}
		await this.database.batch(statements);
		const address = await this.get(userId, id);
		if (!address) throw new Error("Created address could not be loaded");
		return address;
	}

	/**
	 * Uses an out-of-domain temporary default state (-1) only inside the D1
	 * transaction. This lets the target CAS guard all related default changes
	 * without weakening the positive address version constraint.
	 */
	async update(userId: string, id: string, input: UpdateCustomerAddressInput): Promise<boolean> {
		const now = Date.now();
		const result = await this.database.batch([
			this.database.prepare(
				"UPDATE customer_address SET is_default = -1 WHERE id = ? AND user_id = ? AND version = ?",
			).bind(id, userId, input.version),
			this.database.prepare(
				"UPDATE customer_address SET is_default = 0 WHERE user_id = ? AND id <> ? AND is_default = 1 AND ? = 1 AND EXISTS (SELECT 1 FROM customer_address WHERE id = ? AND user_id = ? AND is_default = -1)",
			).bind(userId, id, input.isDefault ? 1 : 0, id, userId),
			this.database.prepare(
				"UPDATE customer_address SET is_default = 1, version = version + 1, updated_at = ? WHERE id = (SELECT id FROM customer_address WHERE user_id = ? AND id <> ? ORDER BY updated_at DESC, id ASC LIMIT 1) AND ? = 0 AND NOT EXISTS (SELECT 1 FROM customer_address WHERE user_id = ? AND is_default = 1) AND EXISTS (SELECT 1 FROM customer_address WHERE id = ? AND user_id = ? AND is_default = -1)",
			).bind(now, userId, id, input.isDefault ? 1 : 0, userId, id, userId),
			this.database.prepare(
				"UPDATE customer_address SET label = ?, recipient_name = ?, mobile = ?, address_line_1 = ?, address_line_2 = ?, landmark = ?, city = ?, state = ?, postal_code = ?, latitude = ?, longitude = ?, delivery_instructions = ?, is_default = CASE WHEN ? = 1 THEN 1 WHEN EXISTS (SELECT 1 FROM customer_address WHERE user_id = ? AND id <> ? AND is_default = 1) THEN 0 WHEN EXISTS (SELECT 1 FROM customer_address WHERE user_id = ? AND id <> ?) THEN 0 ELSE 1 END, version = ?, updated_at = ? WHERE id = ? AND user_id = ? AND version = ? AND is_default = -1",
			).bind(...inputValues(input), input.isDefault ? 1 : 0, userId, id, userId, id, input.version + 1, now, id, userId, input.version),
		]);
		return result[3]?.meta.changes === 1;
	}

	async delete(userId: string, id: string, version: number): Promise<boolean> {
		const now = Date.now();
		const result = await this.database.batch([
			this.database.prepare(
				"UPDATE customer_address SET is_default = -1 WHERE id = ? AND user_id = ? AND version = ?",
			).bind(id, userId, version),
			this.database.prepare(
				"UPDATE customer_address SET is_default = 1, version = version + 1, updated_at = ? WHERE id = (SELECT id FROM customer_address WHERE user_id = ? AND id <> ? ORDER BY updated_at DESC, id ASC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM customer_address WHERE user_id = ? AND is_default = 1) AND EXISTS (SELECT 1 FROM customer_address WHERE id = ? AND user_id = ? AND is_default = -1)",
			).bind(now, userId, id, userId, id, userId),
			this.database.prepare(
				"DELETE FROM customer_address WHERE id = ? AND user_id = ? AND version = ? AND is_default = -1",
			).bind(id, userId, version),
		]);
		return result[2]?.meta.changes === 1;
	}
}
