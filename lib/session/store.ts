import "server-only";

import { randomBytes } from "node:crypto";

import { Redis } from "@upstash/redis";

import type { TssCredentials } from "@/lib/tss/auth";
import { SESSION_TTL_SECONDS } from "@/lib/tss/constants";
import { ConfigurationError } from "@/lib/tss/errors";

import {
  decryptCredentials,
  encryptCredentials,
  type EncryptedEnvelope,
} from "./crypto";

const SESSION_KEY_PREFIX = "ucsd-planner:session:";

export interface SessionStore {
  create(credentials: TssCredentials): Promise<string>;
  get(sessionId: string): Promise<TssCredentials | null>;
  delete(sessionId: string): Promise<void>;
}

export interface KeyValueStore {
  set(
    key: string,
    value: string,
    options: { ex: number },
  ): Promise<unknown>;
  get<T>(key: string): Promise<T | null>;
  del(key: string): Promise<unknown>;
}

export class EncryptedSessionStore implements SessionStore {
  constructor(
    private readonly storage: KeyValueStore,
    private readonly ttlSeconds = SESSION_TTL_SECONDS,
  ) {}

  async create(credentials: TssCredentials): Promise<string> {
    const sessionId = randomBytes(32).toString("base64url");
    const envelope = encryptCredentials(credentials);
    await this.storage.set(
      sessionKey(sessionId),
      JSON.stringify(envelope),
      { ex: this.ttlSeconds },
    );
    return sessionId;
  }

  async get(sessionId: string): Promise<TssCredentials | null> {
    if (!isValidSessionId(sessionId)) return null;
    const stored = await this.storage.get<string | EncryptedEnvelope>(
      sessionKey(sessionId),
    );
    if (!stored) return null;

    const envelope =
      typeof stored === "string"
        ? (JSON.parse(stored) as EncryptedEnvelope)
        : stored;
    return decryptCredentials(envelope);
  }

  async delete(sessionId: string): Promise<void> {
    if (!isValidSessionId(sessionId)) return;
    await this.storage.del(sessionKey(sessionId));
  }
}

export function createSessionStore(): SessionStore {
  return new EncryptedSessionStore(createRedisClient());
}

export function createRedisClient(): Redis {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new ConfigurationError();
  return new Redis({ url, token });
}

export function isValidSessionId(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}
