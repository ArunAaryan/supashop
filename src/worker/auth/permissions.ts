import type { cmsRoleValues } from "../db/schema/access";

export type CmsRole = (typeof cmsRoleValues)[number];

export type Permission =
	| "store:read"
	| "store:update"
	| "team:update"
	| "catalog:write"
	| "inventory:write"
	| "order:manage"
	| "delivery:complete"
	| "analytics:read";

const allPermissions = [
	"store:read",
	"store:update",
	"team:update",
	"catalog:write",
	"inventory:write",
	"order:manage",
	"delivery:complete",
	"analytics:read",
] as const satisfies readonly Permission[];

export const permissionsByRole: Record<CmsRole, readonly Permission[]> = {
	owner: allPermissions,
	admin: allPermissions.filter((permission) => permission !== "team:update"),
	operations: ["store:read", "catalog:write", "inventory:write", "order:manage", "analytics:read"],
	delivery: ["delivery:complete"],
};

export function can(role: CmsRole, permission: Permission): boolean {
	return permissionsByRole[role].includes(permission);
}
