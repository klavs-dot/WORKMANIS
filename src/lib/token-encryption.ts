/**
 * Token encryption / decryption — AES-256-GCM.
 *
 * Used to protect Google OAuth refresh tokens stored in the
 * account-master sheet. Refresh tokens are extremely sensitive:
 * they let anyone holding them act as the user against Google
 * APIs indefinitely (until revoked). Plaintext storage in a
 * Sheet is unacceptable even though only the user can read
 * their own Drive — defense in depth.
 *
 * Why GCM (not CBC, not just hashing):
 *   - GCM is authenticated encryption — modifying ciphertext
 *     makes decryption fail loudly rather than silently
 *     producing garbage. This catches both tampering and disk
 *     corruption. CBC has no such property.
 *   - Hashing (e.g. bcrypt) is one-way — useless here because
 *     we need the original token back to call Google.
 *   - GCM is the modern default; CBC + HMAC is a footgun pattern.
 *
 * Key derivation: AUTH_SECRET (already in env, used by NextAuth
 * for JWT signing) → SHA-256 → 32-byte AES key. Using AUTH_SECRET
 * means we don't need to provision a separate KMS / second secret;
 * losing AUTH_SECRET would already destroy NextAuth sessions, so
 * we're not adding new failure modes.
 *
 * IV (nonce): 12 random bytes per encryption. Critical: NEVER
 * reuse an IV with the same key — that lets an attacker recover
 * plaintext via the GCM keystream. Hence randomBytes(12) every
 * time, and we store the IV alongside the ciphertext (it's not
 * a secret).
 *
 * Output format (3 separate fields, base64-encoded for sheet
 * storage):
 *   ciphertext_b64 — the encrypted token
 *   iv_b64         — 12 random bytes
 *   auth_tag_b64   — 16-byte GCM tag (proves integrity)
 *
 * All three fields are required to decrypt. Splitting them into
 * separate sheet columns (rather than one concatenated blob)
 * makes the data more legible during debugging and avoids
 * fragile parsing if encoding ever changes.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16; // GCM standard

/**
 * Derive the 32-byte AES key from AUTH_SECRET.
 *
 * SHA-256 gives us exactly 32 bytes deterministically. We could
 * use HKDF for slightly better cryptographic hygiene (domain
 * separation between OAuth tokens and any future use), but
 * SHA-256 of a high-entropy secret is acceptable for this use
 * case — AUTH_SECRET is presumed to be 32+ random bytes already.
 */
function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set — cannot encrypt OAuth tokens. " +
        "Set it in .env.local (dev) or Vercel env vars (prod)."
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is too short — needs at least 32 chars for safe " +
        "encryption. Generate with: openssl rand -base64 32"
    );
  }
  return createHash("sha256").update(secret).digest();
}

export interface EncryptedToken {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

/**
 * Encrypt a plaintext string (typically a Google refresh token).
 *
 * Returns 3 base64-encoded fields. Caller stores these in
 * separate sheet columns and passes them back to decrypt() when
 * the token is needed.
 *
 * Each call produces different output (random IV) even for the
 * same plaintext — this is correct GCM behavior and prevents
 * an attacker from recognizing repeated tokens.
 */
export function encryptToken(plaintext: string): EncryptedToken {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty string");
  }

  const key = getKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt a token previously produced by encryptToken().
 *
 * Throws if any of the inputs is missing, if AUTH_SECRET has
 * changed since encryption (the key won't match), or if the
 * ciphertext / authTag was tampered with. Throwing on
 * tampering is intentional — silent failure here would let an
 * attacker substitute a known token.
 */
export function decryptToken(encrypted: EncryptedToken): string {
  if (!encrypted.ciphertext || !encrypted.iv || !encrypted.authTag) {
    throw new Error(
      "Cannot decrypt — one or more fields missing (ciphertext, iv, authTag)"
    );
  }

  const key = getKey();
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`IV must be ${IV_LENGTH} bytes, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Auth tag must be ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`
    );
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (err) {
    // GCM throws "Unsupported state or unable to authenticate
    // data" on tag mismatch. Re-throw with a clearer message
    // for our use case.
    throw new Error(
      "Token decryption failed — auth tag mismatch. Either the " +
        "ciphertext was tampered with, AUTH_SECRET has changed, " +
        "or one of the fields was corrupted in storage. Original: " +
        (err instanceof Error ? err.message : String(err))
    );
  }
}
