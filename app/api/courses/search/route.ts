import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  clearSessionCookie,
  errorResponse,
  setSessionCookie,
} from "@/lib/api/responses";
import {
  requireRequestSession,
  runWithLiveCredentials,
} from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSessionStore } from "@/lib/session/store";
import { TssClient } from "@/lib/tss/client";
import { SESSION_COOKIE_NAME } from "@/lib/tss/constants";
import { AppError, isSessionExpiredError } from "@/lib/tss/errors";
import {
  getCurrentTerm,
  parseTermParams,
  type AcademicTerm,
} from "@/lib/tss/terms";
import type { CourseSearchResponse } from "@/lib/tss/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(2).max(80);

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const store = createSessionStoreSafely();

  try {
    await enforceRateLimit(request, "search", sessionId);
    const sessionStore = store();
    const session = await requireRequestSession(request, sessionStore);

    const parsed = querySchema.safeParse(
      request.nextUrl.searchParams.get("q"),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_QUERY",
            message: "Search query must be between 2 and 80 characters.",
          },
        },
        { status: 400 },
      );
    }

    const term = resolveTerm(request.nextUrl.searchParams);
    const client = new TssClient();
    const { value: courses, refreshed } = await runWithLiveCredentials(
      sessionStore,
      session,
      client,
      (credentials) => client.searchCourses(parsed.data, credentials, term),
    );
    const response = NextResponse.json<CourseSearchResponse>({ courses });
    if (refreshed) setSessionCookie(response, session.sessionId);
    return response;
  } catch (error) {
    const response = errorResponse(error);
    if (isSessionExpiredError(error)) {
      if (sessionId) {
        try {
          await store().delete(sessionId);
        } catch {
          // Preserve the original sanitized upstream error.
        }
      }
      clearSessionCookie(response);
    }
    return response;
  }
}

function resolveTerm(searchParams: URLSearchParams): AcademicTerm {
  const year = searchParams.get("year");
  const period = searchParams.get("period");
  if (year === null && period === null) return getCurrentTerm();

  const term = parseTermParams(year, period);
  if (!term) {
    throw new AppError(
      "UNSUPPORTED_TERM",
      "The requested academic term is not available in TSS.",
      400,
    );
  }
  return term;
}

function createSessionStoreSafely(): () => ReturnType<
  typeof createSessionStore
> {
  let store: ReturnType<typeof createSessionStore> | undefined;
  return () => (store ??= createSessionStore());
}
