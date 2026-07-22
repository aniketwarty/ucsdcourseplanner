import "server-only";

import type { NextRequest } from "next/server";

import type { TssCredentials } from "@/lib/tss/auth";
import { SESSION_COOKIE_NAME } from "@/lib/tss/constants";
import { AppError } from "@/lib/tss/errors";
import type { SessionStore } from "@/lib/session/store";

export interface RequestSession {
  sessionId: string;
  credentials: TssCredentials;
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
