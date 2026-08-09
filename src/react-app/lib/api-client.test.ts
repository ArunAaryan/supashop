import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, apiRequest } from "./api-client";

afterEach(() => vi.unstubAllGlobals());

describe("apiRequest", () => {
	it("sends JSON with credentials and accepts empty successful responses", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(apiRequest<void>("/api/example", { method: "PUT", body: { enabled: true } })).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledWith("/api/example", expect.objectContaining({
			credentials: "include", body: JSON.stringify({ enabled: true }),
		}));
		expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toBeInstanceOf(Headers);
		expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get("content-type")).toBe("application/json");
	});

	it("throws the stable API error envelope", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "CONFLICT", message: "Reload", details: { version: 2 } } }), { status: 409 })));

		await expect(apiRequest("/api/example")).rejects.toEqual(expect.objectContaining<ApiClientError>({
			name: "ApiClientError", status: 409, code: "CONFLICT", message: "Reload", details: { version: 2 },
		}));
	});
});
