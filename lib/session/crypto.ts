import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type { TssCredentials } from "@/lib/tss/auth";
import { ConfigurationError } from "@/lib/tss/errors";

export interface EncryptedEnvelope {
  version: 1;
  iv: string;
  ciphertext: string;
  authTag: string;
}

export function encryptCredentials(
  credentials: TssCredentials,
  key = getEncryptionKey(),
): EncryptedEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptCredentials(
  envelope: EncryptedEnvelope,
  key = getEncryptionKey(),
): TssCredentials {
  try {
    if (envelope.version !== 1) throw new Error("Unsupported envelope");

    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(plaintext.toString("utf8")) as TssCredentials;

    if (
      typeof parsed.cookie !== "string" ||
      typeof parsed.csrfToken !== "string"
    ) {
      throw new Error("Invalid credentials");
    }
    return parsed;
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError();
  }
}

export function getEncryptionKey(raw = process.env.SESSION_ENCRYPTION_KEY): Buffer {
  if (!raw || raw.length < 32) throw new ConfigurationError();

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  if (/^[A-Za-z0-9+/]{43}=?$/.test(raw)) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  }

  return createHash("sha256").update(raw, "utf8").digest();
}
