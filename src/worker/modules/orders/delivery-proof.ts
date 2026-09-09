const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const DELIVERY_PROOF_TTL_MS = 12 * 60 * 60 * 1000;

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
	return bytesToHex(new Uint8Array(digest));
}

export async function deriveProofKey(secret: string): Promise<CryptoKey> {
	const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		{ name: "HKDF", hash: "SHA-256", salt: encoder.encode("supashop-delivery-proof-salt"), info: encoder.encode("supashop:delivery-proof:v1") },
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

async function encryptProofValue(key: CryptoKey, plaintext: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext)));
	const combined = new Uint8Array(iv.length + ciphertext.length);
	combined.set(iv, 0);
	combined.set(ciphertext, iv.length);
	return bytesToHex(combined);
}

async function decryptProofValue(key: CryptoKey, encoded: string): Promise<string> {
	const combined = hexToBytes(encoded);
	const iv = combined.slice(0, 12);
	const ciphertext = combined.slice(12);
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return decoder.decode(plaintext);
}

export type DeliveryProof = {
	orderId: string;
	token: string;
	pin: string;
	tokenHash: string;
	pinHash: string;
	tokenEnc: string;
	pinEnc: string;
	expiresAt: number;
	createdAt: number;
};

export async function generateDeliveryProof(key: CryptoKey, orderId: string, now = Date.now()): Promise<DeliveryProof> {
	const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
	const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
	const [tokenHash, pinHash, tokenEnc, pinEnc] = await Promise.all([
		sha256Hex(token),
		sha256Hex(pin),
		encryptProofValue(key, token),
		encryptProofValue(key, pin),
	]);
	return {
		orderId,
		token,
		pin,
		tokenHash,
		pinHash,
		tokenEnc,
		pinEnc,
		expiresAt: now + DELIVERY_PROOF_TTL_MS,
		createdAt: now,
	};
}

export async function decryptDeliveryProof(key: CryptoKey, proof: { tokenEnc: string; pinEnc: string }): Promise<{ token: string; pin: string }> {
	const [token, pin] = await Promise.all([decryptProofValue(key, proof.tokenEnc), decryptProofValue(key, proof.pinEnc)]);
	return { token, pin };
}

export async function verifyProofValue(proof: { tokenHash: string; pinHash: string }, value: { token?: string; pin?: string }): Promise<boolean> {
	if (value.token) return (await sha256Hex(value.token)) === proof.tokenHash;
	if (value.pin) return (await sha256Hex(value.pin)) === proof.pinHash;
	return false;
}
