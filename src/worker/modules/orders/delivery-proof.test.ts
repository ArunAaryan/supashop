import { describe, expect, it } from "vitest";

import {
	DELIVERY_PROOF_TTL_MS,
	decryptDeliveryProof,
	deriveProofKey,
	generateDeliveryProof,
	sha256Hex,
	verifyProofValue,
} from "./delivery-proof";

describe("delivery proof", () => {
	it("generates an opaque token and six-digit pin with matching hashes", async () => {
		const key = await deriveProofKey("test-secret");
		const proof = await generateDeliveryProof(key, "order-1", 1_000_000);
		expect(proof.token).toMatch(/^[0-9a-f]{64}$/);
		expect(proof.pin).toMatch(/^\d{6}$/);
		expect(proof.tokenHash).toBe(await sha256Hex(proof.token));
		expect(proof.pinHash).toBe(await sha256Hex(proof.pin));
		expect(proof.expiresAt).toBe(1_000_000 + DELIVERY_PROOF_TTL_MS);
	});

	it("round-trips the raw proof through encryption", async () => {
		const key = await deriveProofKey("test-secret");
		const proof = await generateDeliveryProof(key, "order-1");
		expect(await decryptDeliveryProof(key, { tokenEnc: proof.tokenEnc, pinEnc: proof.pinEnc })).toEqual({
			token: proof.token,
			pin: proof.pin,
		});
	});

	it("verifies a token or pin but rejects wrong values", async () => {
		const key = await deriveProofKey("test-secret");
		const proof = await generateDeliveryProof(key, "order-1");
		expect(await verifyProofValue(proof, { token: proof.token })).toBe(true);
		expect(await verifyProofValue(proof, { pin: proof.pin })).toBe(true);
		expect(await verifyProofValue(proof, { pin: "000000" })).toBe(false);
		expect(await verifyProofValue(proof, { token: "0".repeat(64) })).toBe(false);
		expect(await verifyProofValue(proof, {})).toBe(false);
	});

	it("derives a stable key per secret", async () => {
		const keyA = await deriveProofKey("same-secret");
		const keyB = await deriveProofKey("same-secret");
		const proof = await generateDeliveryProof(keyA, "order-1");
		expect(await decryptDeliveryProof(keyB, { tokenEnc: proof.tokenEnc, pinEnc: proof.pinEnc })).toEqual({
			token: proof.token,
			pin: proof.pin,
		});
	});
});
