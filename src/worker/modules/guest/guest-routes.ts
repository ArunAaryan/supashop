import { Hono } from "hono";
import { setCookie } from "hono/cookie";

import { guestSessionResponseSchema } from "../../../shared/contracts/guest";
import type { AppEnv } from "../../auth/session";
import { createGuestToken } from "./guest-cookie";

const guestCookieMaxAgeSeconds = 30 * 24 * 60 * 60;

export function createGuestRoutes() {
	const guest = new Hono<AppEnv>();

	guest.post("/session", async (c) => {
		const token = await createGuestToken(crypto.randomUUID(), c.env.BETTER_AUTH_SECRET);
		setCookie(c, "supashop_guest", token, {
			httpOnly: true,
			maxAge: guestCookieMaxAgeSeconds,
			path: "/",
			sameSite: "Lax",
			secure: c.env.APP_ENV === "production",
		});
		return c.json(guestSessionResponseSchema.parse({ guest: true }));
	});

	return guest;
}
