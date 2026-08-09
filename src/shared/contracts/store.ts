import { z } from "zod";

const postalCodeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z0-9][A-Z0-9 -]{1,11}$/, "Enter a valid postal code");

const optionalHttpsUrlSchema = z.preprocess(
	(value) => (value === null || (typeof value === "string" && value.trim() === "") ? undefined : value),
	z
		.string()
		.trim()
		.url("Enter a valid URL")
		.refine((value) => new URL(value).protocol === "https:", "Directions URL must use HTTPS")
		.optional()
		.transform((value) => value ?? null),
);

const optionalTextSchema = z.preprocess(
	(value) => (value === null || (typeof value === "string" && value.trim() === "") ? undefined : value),
	z.string().trim().max(2_000).optional().transform((value) => value ?? null),
);

const timezoneSchema = z
	.string()
	.trim()
	.min(1, "Timezone is required")
	.refine(
		(value) => {
			try {
				Intl.DateTimeFormat(undefined, { timeZone: value });
				return true;
			} catch {
				return false;
			}
		},
		"Enter an IANA timezone",
	);

export const storeHourSchema = z
	.object({
		weekday: z.number().int().min(0).max(6),
		opensMinute: z.number().int().min(0).max(1_439),
		closesMinute: z.number().int().min(0).max(1_439),
		closed: z.boolean(),
	})
	.strict()
	.superRefine((hour, context) => {
		if (hour.closed && (hour.opensMinute !== 0 || hour.closesMinute !== 0)) {
			context.addIssue({ code: "custom", message: "Closed days must use 00:00 opening and closing times" });
		}
		if (!hour.closed && hour.opensMinute >= hour.closesMinute) {
			context.addIssue({ code: "custom", message: "Closing time must be after opening time" });
		}
	});

const hoursSchema = z
	.array(storeHourSchema)
	.length(7, "Provide one record for each weekday")
	.superRefine((hours, context) => {
		const weekdays = new Set<number>();
		for (const [index, hour] of hours.entries()) {
			if (weekdays.has(hour.weekday)) {
				context.addIssue({ code: "custom", path: [index, "weekday"], message: "Weekdays must be unique" });
			}
			weekdays.add(hour.weekday);
		}
	})
	.transform((hours) => [...hours].sort((left, right) => left.weekday - right.weekday));

const serviceablePostalCodesSchema = z
	.array(postalCodeSchema)
	.max(500, "Provide at most 500 serviceable postal codes")
	.transform((codes) => [...new Set(codes)].sort());

const storeSettingsShape = {
		version: z.number().int().positive(),
		name: z.string().trim().min(1, "Store name is required").max(120),
		description: z.string().trim().max(2_000),
		contactName: z.string().trim().min(1, "Contact name is required").max(120),
		phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter an E.164 phone number"),
		email: z.string().trim().email("Enter a valid email address").max(254),
		addressLine1: z.string().trim().min(1, "Address line 1 is required").max(200),
		addressLine2: z.string().trim().max(200),
		landmark: z.string().trim().max(200),
		city: z.string().trim().min(1, "City is required").max(120),
		state: z.string().trim().min(1, "State is required").max(120),
		postalCode: postalCodeSchema,
		directionsUrl: optionalHttpsUrlSchema,
		deliveryInstructions: optionalTextSchema,
		latitude: z.number().min(-90).max(90).nullable(),
		longitude: z.number().min(-180).max(180).nullable(),
		timezone: timezoneSchema,
		orderCutoffMinutes: z.number().int().min(0).max(1_439).nullable(),
		hours: hoursSchema,
		serviceablePostalCodes: serviceablePostalCodesSchema,
};

function locationPairIsComplete(
	settings: { latitude: number | null; longitude: number | null },
	context: z.RefinementCtx,
) {
	if ((settings.latitude === null) !== (settings.longitude === null)) {
		context.addIssue({ code: "custom", path: ["latitude"], message: "Latitude and longitude must be provided together" });
	}
}

export const storeSettingsSchema = z
	.object(storeSettingsShape)
	.strict()
	.superRefine(locationPairIsComplete);

const configuredStoreSettingsResponseSchema = z
	.object({ ...storeSettingsShape, configured: z.literal(true), ownerUserId: z.string().nullable() })
	.strict()
	.superRefine(locationPairIsComplete);

const draftStoreSettingsResponseSchema = z
	.object({
		version: z.literal(1),
		name: z.string().trim().max(120),
		description: z.string().trim().max(2_000),
		contactName: z.string().trim().max(120),
		phone: z.string().trim().max(16),
		email: z.string().trim().max(254),
		addressLine1: z.string().trim().max(200),
		addressLine2: z.string().trim().max(200),
		landmark: z.string().trim().max(200),
		city: z.string().trim().max(120),
		state: z.string().trim().max(120),
		postalCode: z.string().trim().toUpperCase().max(12),
		directionsUrl: optionalHttpsUrlSchema,
		deliveryInstructions: optionalTextSchema,
		latitude: z.number().min(-90).max(90).nullable(),
		longitude: z.number().min(-180).max(180).nullable(),
		timezone: timezoneSchema,
		orderCutoffMinutes: z.number().int().min(0).max(1_439).nullable(),
		hours: hoursSchema,
		serviceablePostalCodes: serviceablePostalCodesSchema,
		configured: z.literal(false),
		ownerUserId: z.null(),
	})
	.strict()
	.superRefine(locationPairIsComplete);

export const storeSettingsResponseSchema = z.discriminatedUnion("configured", [
	configuredStoreSettingsResponseSchema,
	draftStoreSettingsResponseSchema,
]);

const publicStoreSettingsShape = {
	name: storeSettingsShape.name,
	description: storeSettingsShape.description,
	contactName: storeSettingsShape.contactName,
	phone: storeSettingsShape.phone,
	email: storeSettingsShape.email,
	addressLine1: storeSettingsShape.addressLine1,
	addressLine2: storeSettingsShape.addressLine2,
	landmark: storeSettingsShape.landmark,
	city: storeSettingsShape.city,
	state: storeSettingsShape.state,
	postalCode: storeSettingsShape.postalCode,
	directionsUrl: storeSettingsShape.directionsUrl,
	deliveryInstructions: storeSettingsShape.deliveryInstructions,
	latitude: storeSettingsShape.latitude,
	longitude: storeSettingsShape.longitude,
	timezone: storeSettingsShape.timezone,
	orderCutoffMinutes: storeSettingsShape.orderCutoffMinutes,
	hours: storeSettingsShape.hours,
	serviceablePostalCodes: storeSettingsShape.serviceablePostalCodes,
};
export const publicStoreSettingsResponseSchema = z
	.object(publicStoreSettingsShape)
	.strict()
	.superRefine(locationPairIsComplete);

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;
export type StoreSettingsResponse = z.infer<typeof storeSettingsResponseSchema>;
export type PublicStoreSettingsResponse = z.infer<typeof publicStoreSettingsResponseSchema>;
