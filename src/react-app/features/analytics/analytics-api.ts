import { useQuery } from "@tanstack/react-query";

import { analyticsOverviewResponseSchema, type AnalyticsOverviewResponse } from "../../../shared/contracts/analytics";
import { apiRequest } from "../../lib/api-client";

async function requestOverview(): Promise<AnalyticsOverviewResponse> {
	const parsed = analyticsOverviewResponseSchema.safeParse(await apiRequest<unknown>("/api/cms/analytics/overview"));
	if (!parsed.success) throw new Error("The server returned an invalid dashboard response.");
	return parsed.data;
}

export function useAnalyticsOverview() {
	return useQuery({ queryKey: ["analytics-overview"], queryFn: requestOverview });
}
