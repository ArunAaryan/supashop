export const apiErrorStatuses = {
	BAD_REQUEST: 400,
	UNAUTHENTICATED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	VALIDATION_ERROR: 422,
	INTERNAL_ERROR: 500,
} as const;

export type ApiErrorCode = keyof typeof apiErrorStatuses;
export type ApiErrorDetails = Record<string, unknown>;

export class ApiError extends Error {
	readonly status: (typeof apiErrorStatuses)[ApiErrorCode];

	constructor(
		readonly code: Exclude<ApiErrorCode, "INTERNAL_ERROR">,
		message: string,
		readonly details?: ApiErrorDetails,
	) {
		super(message);
		this.name = "ApiError";
		this.status = apiErrorStatuses[code];
	}
}

export function apiErrorResponse(error: unknown, requestId?: string): Response {
	if (error instanceof ApiError) {
		return Response.json(
			{
				error: {
					code: error.code,
					message: error.message,
					...(error.details === undefined ? {} : { details: error.details }),
				},
			},
			{ status: error.status },
		);
	}

	return Response.json(
		{
			error: {
				code: "INTERNAL_ERROR",
				message: "An unexpected error occurred",
				...(requestId ? { requestId } : {}),
			},
		},
		{ status: apiErrorStatuses.INTERNAL_ERROR },
	);
}
