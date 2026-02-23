/**
 * PBKDF2 password hashing using Web Crypto API.
 *
 * Default Scrypt (N=16384) exceeds Cloudflare Workers CPU time limits.
 * PBKDF2 via crypto.subtle is hardware-accelerated in Workers and stays
 * well within budget.
 *
 * Format: `pbkdf2:iterations:salt_hex:hash_hex`
 */

const ITERATIONS = 100_000;
const HASH_ALGO = "SHA-256";
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt, ITERATIONS);
  const saltHex = toHex(salt);
  const hashHex = toHex(new Uint8Array(key));
  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) {
    return false;
  }
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHash = parts[3];
  const key = await deriveKey(password, salt, iterations);
  const actualHash = toHex(new Uint8Array(key));
  return timingSafeEqual(expectedHash, actualHash);
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: HASH_ALGO },
    keyMaterial,
    KEY_BYTES * 8,
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
