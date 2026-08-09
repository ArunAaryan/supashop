import { describe, expect, it } from "vitest";

import { ApiError, apiErrorResponse } from "./errors";

describe("ApiError", () => {
	it("serializes stable client-facing errors", async () => {
		const response = apiErrorResponse(
			new ApiError("FORBIDDEN", "Permission required", { required: "delivery:complete" }),
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: {
				code: "FORBIDDEN",
				message: "Permission required",
				details: { required: "delivery:complete" },
			},
		});
	});

	it("does not expose unexpected exception details", async () => {
		const error = Object.assign(new Error("database password=not-for-clients"), {
			details: { databasePassword: "not-for-clients" },
		});
		const response = apiErrorResponse(error, "request-123");

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: {
				code: "INTERNAL_ERROR",
				message: "An unexpected error occurred",
				requestId: "request-123",
			},
		});
	});
});
