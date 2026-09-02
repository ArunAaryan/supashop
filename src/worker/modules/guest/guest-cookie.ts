const guestIdEncoder = new TextEncoder();
const guestIdDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const base64urlPattern = /^[A-Za-z0-9_-]+$/;
const hmacSignatureLength = 32;
const maximumGuestIdBytes = 128;
const maximumGuestPayloadBytes = 256;
const minimumSecretBytes = 32;
export const guestSessionLifetimeMs = 30 * 24 * 60 * 60 * 1_000;

function assertSigningSecret(secret: string): Uint8Array {
	const bytes = guestIdEncoder.encode(secret);
	if (bytes.byteLength < minimumSecretBytes) {
		throw new TypeError("guest signing secret must be at least 32 characters");
	}
	return bytes;
}

function encodeBase64url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64url(value: string): Uint8Array | null {
	if (!base64urlPattern.test(value) || value.length % 4 === 1) return null;

	try {
		const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
		const binary = atob(base64);
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		return encodeBase64url(bytes) === value ? bytes : null;
	} catch {
		return null;
	}
}

function assertGuestId(guestId: string): Uint8Array {
	const bytes = guestIdEncoder.encode(guestId);
	if (bytes.byteLength === 0 || bytes.byteLength > maximumGuestIdBytes) {
		throw new TypeError("guest id must be between 1 and 128 bytes");
	}
	return bytes;
}

function assertExpiry(expiresAt: number): void {
	if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) {
		throw new TypeError("guest expiry must be a nonnegative safe integer");
	}
}

type GuestTokenPayload = { guestId: string; expiresAt: number };

function decodePayload(bytes: Uint8Array): GuestTokenPayload | null {
	if (bytes.byteLength === 0 || bytes.byteLength > maximumGuestPayloadBytes) return null;
	try {
		const value: unknown = JSON.parse(guestIdDecoder.decode(bytes));
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const record = value as Record<string, unknown>;
		if (Object.keys(record).length !== 2 || !("guestId" in record) || !("expiresAt" in record)) return null;
		const guestId = record.guestId;
		const expiresAt = record.expiresAt;
		if (typeof guestId !== "string" || typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt < 0) return null;
		assertGuestId(guestId);
		return { guestId, expiresAt };
	} catch {
		return null;
	}
}

async function signingKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		assertSigningSecret(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
}

async function sign(value: Uint8Array, secret: string): Promise<Uint8Array> {
	const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), value);
	return new Uint8Array(signature);
}

function signaturesMatch(expected: Uint8Array, actual: Uint8Array): boolean {
	if (expected.byteLength !== actual.byteLength) return false;

	let difference = 0;
	for (let index = 0; index < expected.byteLength; index += 1) {
		difference |= expected[index]! ^ actual[index]!;
	}
	return difference === 0;
}

export async function createGuestToken(
	guestId: string,
	secret: string,
	expiresAt = Date.now() + guestSessionLifetimeMs,
): Promise<string> {
	assertGuestId(guestId);
	assertExpiry(expiresAt);
	const payload = guestIdEncoder.encode(JSON.stringify({ guestId, expiresAt }));
	const signature = await sign(payload, secret);
	return `${encodeBase64url(payload)}.${encodeBase64url(signature)}`;
}

export async function verifyGuestToken(
	token: string,
	secret: string,
	now = Date.now(),
): Promise<string | null> {
	if (!Number.isSafeInteger(now) || now < 0) return null;
	const parts = token.split(".");
	if (parts.length !== 2) return null;

	const [encodedGuestId, encodedSignature] = parts;
	if (!encodedGuestId || !encodedSignature) return null;

	const payloadBytes = decodeBase64url(encodedGuestId);
	const suppliedSignature = decodeBase64url(encodedSignature);
	if (!payloadBytes || !suppliedSignature || payloadBytes.byteLength > maximumGuestPayloadBytes || suppliedSignature.byteLength !== hmacSignatureLength) {
		return null;
	}

	const payload = decodePayload(payloadBytes);
	if (!payload || !signaturesMatch(await sign(payloadBytes, secret), suppliedSignature)) {
		return null;
	}
	if (payload.expiresAt <= now || payload.expiresAt > now + guestSessionLifetimeMs) {
		return null;
	}

	return payload.guestId;
}
