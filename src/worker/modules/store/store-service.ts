import {
	publicStoreSettingsResponseSchema,
	storeSettingsResponseSchema,
	storeSettingsSchema,
	type PublicStoreSettingsResponse,
	type StoreSettingsInput,
	type StoreSettingsResponse,
} from "../../../shared/contracts/store";
import { ApiError } from "../../http/errors";
import { StoreRepository, type StoredStore } from "./store-repository";

function emptyStore(): StoreSettingsResponse {
	return storeSettingsResponseSchema.parse({
		configured: false,
		ownerUserId: null,
		version: 1,
		name: "",
		description: "",
		contactName: "",
		phone: "",
		email: "",
		addressLine1: "",
		addressLine2: "",
		landmark: "",
		city: "",
		state: "",
		postalCode: "",
		directionsUrl: null,
		deliveryInstructions: null,
		latitude: null,
		longitude: null,
		timezone: "Asia/Kolkata",
		orderCutoffMinutes: null,
		hours: Array.from({ length: 7 }, (_, weekday) => ({
			weekday,
			opensMinute: 0,
			closesMinute: 0,
			closed: true,
		})),
		serviceablePostalCodes: [],
	});
}

function toStoreSettings(store: StoredStore): StoreSettingsResponse {
	return storeSettingsResponseSchema.parse({
		configured: true,
		ownerUserId: store.owner_user_id,
		version: store.version,
		name: store.name,
		description: store.description,
		contactName: store.contact_name,
		phone: store.phone,
		email: store.email,
		addressLine1: store.address_line_1,
		addressLine2: store.address_line_2,
		landmark: store.landmark,
		city: store.city,
		state: store.state,
		postalCode: store.postal_code,
		directionsUrl: store.directions_url || null,
		deliveryInstructions: store.delivery_instructions || null,
		latitude: store.latitude,
		longitude: store.longitude,
		timezone: store.timezone,
		orderCutoffMinutes: store.order_cutoff_minutes,
		hours: store.hours.map((hour) => ({
			weekday: hour.weekday,
			opensMinute: hour.opens_minute,
			closesMinute: hour.closes_minute,
			closed: Boolean(hour.closed),
		})),
		serviceablePostalCodes: store.serviceablePostalCodes,
	});
}

export class StoreService {
	constructor(private readonly repository: StoreRepository) {}

	async getCmsStore(): Promise<StoreSettingsResponse> {
		const store = await this.repository.getStore();
		return store ? toStoreSettings(store) : emptyStore();
	}

	async getPublicStore(): Promise<PublicStoreSettingsResponse> {
		const store = await this.repository.getStore();
		if (!store) throw new ApiError("NOT_FOUND", "Store settings are not configured");
		const settings = toStoreSettings(store);
		return publicStoreSettingsResponseSchema.parse({
			name: settings.name,
			description: settings.description,
			contactName: settings.contactName,
			phone: settings.phone,
			email: settings.email,
			addressLine1: settings.addressLine1,
			addressLine2: settings.addressLine2,
			landmark: settings.landmark,
			city: settings.city,
			state: settings.state,
			postalCode: settings.postalCode,
			directionsUrl: settings.directionsUrl,
			deliveryInstructions: settings.deliveryInstructions,
			latitude: settings.latitude,
			longitude: settings.longitude,
			timezone: settings.timezone,
			orderCutoffMinutes: settings.orderCutoffMinutes,
			hours: settings.hours,
			serviceablePostalCodes: settings.serviceablePostalCodes,
		});
	}

	async updateStore(payload: unknown, ownerUserId: string): Promise<StoreSettingsResponse> {
		const parsed = storeSettingsSchema.safeParse(payload);
		if (!parsed.success) {
			throw new ApiError("VALIDATION_ERROR", "Store settings are invalid", {
				issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
			});
		}

		const input: StoreSettingsInput = parsed.data;
		const changed = await this.repository.upsertStore(input, input.version, ownerUserId);
		if (!changed) {
			throw new ApiError("CONFLICT", "Store settings changed; reload and retry");
		}
		const store = await this.repository.getStore();
		if (!store) throw new Error("Store settings could not be loaded after a successful write");
		return toStoreSettings(store);
	}
}
