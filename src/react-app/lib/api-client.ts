export class ApiClientError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "ApiClientError";
	}
}

type ApiRequestInit = Omit<RequestInit, "body" | "headers"> & {
	body?: unknown;
	headers?: HeadersInit;
};

type ApiErrorEnvelope = { error?: { code?: unknown; message?: unknown; details?: unknown } };

async function readJson(response: Response): Promise<unknown | undefined> {
	if (response.status === 204 || response.status === 205) return undefined;
	const text = await response.text();
	if (!text) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
	const { body, headers, ...request } = init;
	const requestHeaders = new Headers(headers);
	if (body !== undefined && !requestHeaders.has("content-type")) requestHeaders.set("content-type", "application/json");
	const response = await fetch(path, {
		...request,
		credentials: "include",
		headers: requestHeaders,
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const data = await readJson(response);
	if (response.ok) return data as T;

	const envelope = data as ApiErrorEnvelope | undefined;
	const error = envelope?.error;
	throw new ApiClientError(
		response.status,
		typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
		typeof error?.message === "string" ? error.message : "The request could not be completed",
		error?.details && typeof error.details === "object" && !Array.isArray(error.details)
			? error.details as Record<string, unknown>
			: undefined,
	);
}
