import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { storeSettingsResponseSchema, type StoreSettingsInput, type StoreSettingsResponse } from "../../../shared/contracts/store";
import { apiRequest } from "../../lib/api-client";

export const storeSettingsQueryKey = ["cms", "store"] as const;

async function readStoreSettings(): Promise<StoreSettingsResponse> {
	const response = await apiRequest<unknown>("/api/cms/store");
	const parsed = storeSettingsResponseSchema.safeParse(response);
	if (!parsed.success) throw new Error("The store settings response is invalid. Please retry.");
	return parsed.data;
}

async function saveStoreSettings(settings: StoreSettingsInput): Promise<StoreSettingsResponse> {
	const response = await apiRequest<unknown>("/api/cms/store", { method: "PUT", body: settings });
	const parsed = storeSettingsResponseSchema.safeParse(response);
	if (!parsed.success) throw new Error("The saved store settings response is invalid. Please retry.");
	return parsed.data;
}

export function useStoreSettings() {
	return useQuery({ queryKey: storeSettingsQueryKey, queryFn: readStoreSettings });
}

export function useSaveStoreSettings() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: saveStoreSettings,
		onSuccess: (saved) => queryClient.setQueryData(storeSettingsQueryKey, saved),
	});
}
