import "server-only";

import type { NextRequest } from "next/server";

import type { SessionStore } from "@/lib/session/store";
import type { TssCredentials } from "@/lib/tss/auth";
import { TssClient } from "@/lib/tss/client";
import { SESSION_COOKIE_NAME } from "@/lib/tss/constants";
import { AppError, isSessionExpiredError } from "@/lib/tss/errors";

export interface RequestSession {
  sessionId: string;
  credentials: TssCredentials;
}

export interface LiveCredentialsResult<T> {
  value: T;
  /** True when CSRF was refreshed from the stored SAP session cookie. */
  refreshed: boolean;
}

export async function requireRequestSession(
  request: NextRequest,
  store: SessionStore,
): Promise<RequestSession> {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    throw new AppError(
      "NOT_CONNECTED",
      "Connect your UCSD session before using this endpoint.",
      401,
    );
  }

  const credentials = await store.get(sessionId);
  if (!credentials) {
    throw new AppError(
      "NOT_CONNECTED",
      "Connect your UCSD session before using this endpoint.",
      401,
    );
  }

  return { sessionId, credentials };
}

/**
 * Run a TSS call with stored credentials. If TSS rejects them (often a stale
 * CSRF token while the SAP session cookie is still valid), refresh CSRF from
 * the stored cookie, retry once, and persist the new credentials.
 */
export async function runWithLiveCredentials<T>(
  store: SessionStore,
  session: RequestSession,
  client: TssClient,
  operation: (credentials: TssCredentials) => Promise<T>,
): Promise<LiveCredentialsResult<T>> {
  try {
    return {
      value: await operation(session.credentials),
      refreshed: false,
    };
  } catch (error) {
    if (!isSessionExpiredError(error)) throw error;

    let refreshed: TssCredentials;
    try {
      refreshed = await client.fetchCsrfToken(session.credentials.cookie);
    } catch {
      // Cookie itself is no longer usable — surface the original auth error.
      throw error;
    }

    const value = await operation(refreshed);
    try {
      await store.update(session.sessionId, refreshed);
    } catch {
      // The TSS call succeeded; keep serving even if Redis persistence fails.
    }
    return { value, refreshed: true };
  }
}
