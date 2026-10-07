import { RelayError } from "./responses";

const encoder = new TextEncoder();

function base64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

export async function importTokenKey(secret: string | undefined): Promise<CryptoKey> {
  try {
    const raw = bytes(secret?.trim() ?? "");
    if (raw.byteLength !== 32) throw new Error("Invalid key size");
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    throw new RelayError(503, "relay_not_configured", "TOKEN_ENCRYPTION_KEY must contain a base64-encoded 32-byte key.");
  }
}

export async function encryptText(plaintext: string, key: CryptoKey, context = ""): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) }, key, encoder.encode(plaintext)
  );
  return `v1.${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

export async function decryptText(ciphertext: string, key: CryptoKey, context = ""): Promise<string> {
  const [version, iv, encrypted, extra] = ciphertext.split(".");
  if (version !== "v1" || !iv || !encrypted || extra !== undefined) {
    throw new Error("Invalid encrypted token format");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(iv), additionalData: encoder.encode(context) }, key, bytes(encrypted)
  );
  return new TextDecoder().decode(plaintext);
}

export function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashHex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
