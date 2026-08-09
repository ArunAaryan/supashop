import { z } from "zod";

export const guestSessionResponseSchema = z.object({
	guest: z.literal(true),
});

export type GuestSessionResponse = z.infer<typeof guestSessionResponseSchema>;
