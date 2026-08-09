import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";

import { createDb } from "../db/client";
import * as schema from "../db/schema";

export type AuthBindings = {
	BETTER_AUTH_SECRET: string;
};

export type WorkerBindings = Omit<Env, "APP_ENV" | "BETTER_AUTH_URL"> &
	AuthBindings & {
		APP_ENV: string;
		BETTER_AUTH_URL: string;
	};

type AuthEnvironment = Pick<WorkerBindings, "BETTER_AUTH_URL" | "DB"> & AuthBindings;

export function createAuth(env: AuthEnvironment) {
	return betterAuth({
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [env.BETTER_AUTH_URL],
		database: drizzleAdapter(createDb(env.DB), {
			provider: "sqlite",
			schema,
		}),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
		},
	});
}

export type AuthInstance = ReturnType<typeof createAuth>;
export type AuthSession = AuthInstance["$Infer"]["Session"]["session"];
export type AuthUser = AuthInstance["$Infer"]["Session"]["user"];
