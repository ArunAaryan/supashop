import { useQuery } from "@tanstack/react-query";

export type CmsRole = "owner" | "admin" | "operations" | "delivery";

export type SessionSnapshot = {
	guest: boolean;
	user: { id: string; email?: string } | null;
	session: { id: string; expiresAt: string } | null;
	cmsRole: CmsRole | null;
};

export async function getSession(): Promise<SessionSnapshot> {
	const response = await fetch("/api/session", { credentials: "include" });
	if (!response.ok) throw new Error("Unable to confirm your session");
	return response.json() as Promise<SessionSnapshot>;
}

export function useSession() {
	return useQuery({ queryKey: ["session"], queryFn: getSession, retry: false, staleTime: 30_000 });
}
