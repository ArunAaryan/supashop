export type ListSortDirection = "asc" | "desc";

export type ListState = {
	page: number;
	pageSize: number;
	sort?: string;
	direction: ListSortDirection;
	q?: string;
};

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPageSize = 100;

function readPositiveInteger(value: string | null, fallback: number, maximum?: number) {
	if (value === null || value.trim() === "") return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) return fallback;
	return Math.min(maximum ?? Number.MAX_SAFE_INTEGER, Math.max(1, parsed));
}

function optionalValue(value: string | null) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function readListState(params: URLSearchParams): ListState {
	const sort = optionalValue(params.get("sort"));
	const q = optionalValue(params.get("q"));
	const direction = params.get("direction") === "desc" ? "desc" : "asc";

	return {
		page: readPositiveInteger(params.get("page"), defaultPage),
		pageSize: readPositiveInteger(params.get("pageSize"), defaultPageSize, maximumPageSize),
		...(sort ? { sort } : {}),
		direction,
		...(q ? { q } : {}),
	};
}

export function writeListState(state: ListState): URLSearchParams {
	const normalized = readListState(new URLSearchParams({
		page: String(state.page),
		pageSize: String(state.pageSize),
		sort: state.sort ?? "",
		direction: state.direction,
		q: state.q ?? "",
	}));
	const params = new URLSearchParams({
		page: String(normalized.page),
		pageSize: String(normalized.pageSize),
	});
	if (normalized.sort) params.set("sort", normalized.sort);
	params.set("direction", normalized.direction);
	if (normalized.q) params.set("q", normalized.q);
	return params;
}
