import { describe, expect, it } from "vitest";

import { ApiError, apiErrorResponse } from "./errors";

describe("ApiError", () => {
	it("serializes stable client-facing errors", async () => {
		const response = apiErrorResponse(new ApiError("FORBIDDEN", "Permission required"));

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: { code: "FORBIDDEN", message: "Permission required" },
		});
	});

	it("does not expose unexpected exception details", async () => {
		const response = apiErrorResponse(new Error("database password=not-for-clients"), "request-123");

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
