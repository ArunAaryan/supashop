import type { StoreSettingsInput } from "../../../shared/contracts/store";

type StoreProfileRow = {
	owner_user_id: string | null;
	name: string;
	description: string;
	contact_name: string;
	phone: string;
	email: string;
	address_line_1: string;
	address_line_2: string;
	landmark: string;
	city: string;
	state: string;
	postal_code: string;
	directions_url: string;
	delivery_instructions: string;
	latitude: number | null;
	longitude: number | null;
	timezone: string;
	order_cutoff_minutes: number | null;
	version: number;
};

type StoreHourRow = {
	weekday: number;
	opens_minute: number;
	closes_minute: number;
	closed: number;
};

export type StoredStore = StoreProfileRow & {
	hours: StoreHourRow[];
	serviceablePostalCodes: string[];
	closures: Array<{ id: string; startsOn: string; endsOn: string; reason: string }>;
};

type D1ResultWithChanges = { meta: { changes: number } };

// D1 permits 100 bound parameters per statement. Reserving one for the
// compare-and-swap sentinel keeps each bulk insert within that limit.
const POSTAL_CODES_PER_INSERT = 90;

export class StoreRepository {
	constructor(private readonly database: D1Database) {}

	async getStore(): Promise<StoredStore | null> {
		const [profileResult, hoursResult, postalCodesResult, closuresResult] = await this.database.batch([
			this.database.prepare(
				"SELECT owner_user_id, name, description, contact_name, phone, email, address_line_1, address_line_2, landmark, city, state, postal_code, directions_url, delivery_instructions, latitude, longitude, timezone, order_cutoff_minutes, version FROM store_profile WHERE singleton_key = 1",
			),
			this.database.prepare(
				"SELECT weekday, opens_minute, closes_minute, closed FROM store_hours ORDER BY weekday",
			),
			this.database.prepare(
				"SELECT postal_code FROM serviceable_postal_code WHERE active = 1 ORDER BY postal_code",
			),
			this.database.prepare(
				"SELECT id, starts_on, ends_on, reason FROM store_closure ORDER BY starts_on, ends_on",
			),
		]);
		const profile = (profileResult.results[0] ?? null) as StoreProfileRow | null;
		if (!profile) return null;

		return {
			...profile,
			hours: hoursResult.results as StoreHourRow[],
			serviceablePostalCodes: (postalCodesResult.results as { postal_code: string }[]).map(
				(row) => row.postal_code,
			),
			closures: (closuresResult.results as Array<{ id: string; starts_on: string; ends_on: string; reason: string }>).map(
				(row) => ({ id: row.id, startsOn: row.starts_on, endsOn: row.ends_on, reason: row.reason }),
			),
		};
	}

	/**
	 * Writes the profile and both collections in one D1 transaction. A negative
	 * version is an in-transaction sentinel: every child statement is guarded by
	 * it, so a failed compare-and-swap cannot modify existing children.
	 */
	async upsertStore(
		input: StoreSettingsInput,
		expectedVersion: number,
		ownerUserId: string,
	): Promise<boolean> {
		const temporaryVersion = -expectedVersion;
		const now = Date.now();
		const profileValues = [
			input.name,
			input.description,
			input.contactName,
			input.phone,
			input.email,
			input.addressLine1,
			input.addressLine2,
			input.landmark,
			input.city,
			input.state,
			input.postalCode,
			input.directionsUrl ?? "",
			input.deliveryInstructions ?? "",
			input.latitude,
			input.longitude,
			input.timezone,
			input.orderCutoffMinutes,
		] as const;
		const statements = [
			this.database
				.prepare(
					"UPDATE store_profile SET name = ?, description = ?, contact_name = ?, phone = ?, email = ?, address_line_1 = ?, address_line_2 = ?, landmark = ?, city = ?, state = ?, postal_code = ?, directions_url = ?, delivery_instructions = ?, latitude = ?, longitude = ?, timezone = ?, order_cutoff_minutes = ?, version = ?, updated_at = ? WHERE singleton_key = 1 AND version = ?",
				)
				.bind(...profileValues, temporaryVersion, now, expectedVersion),
			this.database
				.prepare(
					"INSERT INTO store_profile (singleton_key, name, description, owner_user_id, contact_name, phone, email, address_line_1, address_line_2, landmark, city, state, postal_code, directions_url, delivery_instructions, latitude, longitude, timezone, order_cutoff_minutes, version, created_at, updated_at) SELECT 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ? = 1 ON CONFLICT(singleton_key) DO NOTHING",
				)
				.bind(...profileValues.slice(0, 2), ownerUserId, ...profileValues.slice(2), temporaryVersion, now, now, expectedVersion),
			...this.replaceHours(input.hours, temporaryVersion),
			...this.replacePostalCodes(input.serviceablePostalCodes, temporaryVersion),
			...this.replaceClosures(input.closures, temporaryVersion),
			this.database
				.prepare("UPDATE store_profile SET version = ? WHERE singleton_key = 1 AND version = ?")
				.bind(expectedVersion + 1, temporaryVersion),
		];

		const results = (await this.database.batch(statements)) as D1ResultWithChanges[];
		return results.at(-1)?.meta.changes === 1;
	}

	replaceHours(hours: StoreSettingsInput["hours"], temporaryVersion: number): D1PreparedStatement[] {
		const guard = "EXISTS (SELECT 1 FROM store_profile WHERE singleton_key = 1 AND version = ?)";
		return [
			this.database.prepare(`DELETE FROM store_hours WHERE ${guard}`).bind(temporaryVersion),
			...hours.map((hour) =>
				this.database
					.prepare(
						`INSERT INTO store_hours (id, weekday, opens_minute, closes_minute, closed) SELECT ?, ?, ?, ?, ? WHERE ${guard}`,
					)
					.bind(
						crypto.randomUUID(),
						hour.weekday,
						hour.opensMinute,
						hour.closesMinute,
						hour.closed,
						temporaryVersion,
					),
			),
		];
	}

	replaceClosures(closures: StoreSettingsInput["closures"], temporaryVersion: number): D1PreparedStatement[] {
		const guard = "EXISTS (SELECT 1 FROM store_profile WHERE singleton_key = 1 AND version = ?)";
		return [
			this.database.prepare(`DELETE FROM store_closure WHERE ${guard}`).bind(temporaryVersion),
			...closures.map((closure) =>
				this.database
					.prepare(
						`INSERT INTO store_closure (id, starts_on, ends_on, reason, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ? WHERE ${guard}`,
					)
					.bind(closure.id, closure.startsOn, closure.endsOn, closure.reason, Date.now(), Date.now(), temporaryVersion),
			),
		];
	}

	replacePostalCodes(codes: string[], temporaryVersion: number): D1PreparedStatement[] {
		const guard = "EXISTS (SELECT 1 FROM store_profile WHERE singleton_key = 1 AND version = ?)";
		return [
			this.database.prepare(`DELETE FROM serviceable_postal_code WHERE ${guard}`).bind(temporaryVersion),
			...Array.from({ length: Math.ceil(codes.length / POSTAL_CODES_PER_INSERT) }, (_, index) => {
				const chunk = codes.slice(
					index * POSTAL_CODES_PER_INSERT,
					(index + 1) * POSTAL_CODES_PER_INSERT,
				);
				const values = chunk.map(() => "(?)").join(", ");
				return this.database
					.prepare(
						`WITH postal_codes(postal_code) AS (VALUES ${values}) INSERT INTO serviceable_postal_code (postal_code, active) SELECT postal_code, true FROM postal_codes WHERE ${guard}`,
					)
					.bind(...chunk, temporaryVersion);
			}),
		];
	}
}
