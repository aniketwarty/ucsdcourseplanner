import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  clearSessionCookie,
  errorResponse,
  setSessionCookie,
} from "@/lib/api/responses";
import { assertSameOrigin } from "@/lib/api/origin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSessionStore } from "@/lib/session/store";
import { normalizeTssCookie, MAX_COOKIE_HEADER_LENGTH } from "@/lib/tss/auth";
import { TssClient } from "@/lib/tss/client";
import { SESSION_COOKIE_NAME } from "@/lib/tss/constants";
import { AppError, isSessionExpiredError } from "@/lib/tss/errors";
import type { SessionStatusResponse } from "@/lib/tss/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authBodySchema = z
  .object({
    cookie: z.string().min(1).max(MAX_COOKIE_HEADER_LENGTH),
  })
  .strict();

export async function POST(request: NextRequest) {
  let store: ReturnType<typeof createSessionStore> | null = null;
  try {
    assertSameOrigin(request);
    const existingSessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    await enforceRateLimit(request, "auth", existingSessionId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw invalidBody();
    }
    const parsed = authBodySchema.safeParse(body);
    if (!parsed.success) throw invalidBody();

    const cookie = normalizeTssCookie(parsed.data.cookie);
    const credentials = await new TssClient().fetchCsrfToken(cookie);
    store = createSessionStore();
    const sessionId = await store.create(credentials);

    if (existingSessionId) await store.delete(existingSessionId);

    const response = NextResponse.json<SessionStatusResponse>({
      connected: true,
    });
    setSessionCookie(response, sessionId);
    return response;
  } catch (error) {
    const response = errorResponse(error);
    if (isSessionExpiredError(error)) {
      const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (sessionId) {
        try {
          store ??= createSessionStore();
          await store.delete(sessionId);
        } catch {
          // Preserve the original sanitized authentication error.
        }
      }
      clearSessionCookie(response);
    }
    return response;
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    await enforceRateLimit(request, "auth", sessionId);
    const connected = sessionId
      ? (await createSessionStore().get(sessionId)) !== null
      : false;
    return NextResponse.json<SessionStatusResponse>({ connected });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    await enforceRateLimit(request, "auth", sessionId);
    if (sessionId) await createSessionStore().delete(sessionId);

    const response = NextResponse.json<SessionStatusResponse>({
      connected: false,
    });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

function invalidBody(): AppError {
  return new AppError(
    "INVALID_REQUEST",
    "Request body must contain a valid cookie string.",
    400,
  );
}
