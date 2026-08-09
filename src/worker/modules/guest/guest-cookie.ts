const guestIdEncoder = new TextEncoder();
const guestIdDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const base64urlPattern = /^[A-Za-z0-9_-]+$/;
const hmacSignatureLength = 32;
const maximumGuestIdBytes = 128;
const minimumSecretBytes = 32;

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

export async function createGuestToken(guestId: string, secret: string): Promise<string> {
	const encodedGuestId = assertGuestId(guestId);
	const signature = await sign(encodedGuestId, secret);
	return `${encodeBase64url(encodedGuestId)}.${encodeBase64url(signature)}`;
}

export async function verifyGuestToken(token: string, secret: string): Promise<string | null> {
	const parts = token.split(".");
	if (parts.length !== 2) return null;

	const [encodedGuestId, encodedSignature] = parts;
	if (!encodedGuestId || !encodedSignature) return null;

	const guestIdBytes = decodeBase64url(encodedGuestId);
	const suppliedSignature = decodeBase64url(encodedSignature);
	if (!guestIdBytes || !suppliedSignature || guestIdBytes.byteLength > maximumGuestIdBytes || suppliedSignature.byteLength !== hmacSignatureLength) {
		return null;
	}

	let guestId: string;
	try {
		guestId = guestIdDecoder.decode(guestIdBytes);
	} catch {
		return null;
	}
	if (guestId.length === 0 || !signaturesMatch(await sign(guestIdBytes, secret), suppliedSignature)) {
		return null;
	}

	return guestId;
}
