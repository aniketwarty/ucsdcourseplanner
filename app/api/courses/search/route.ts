import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  clearSessionCookie,
  errorResponse,
} from "@/lib/api/responses";
import { requireRequestSession } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSessionStore } from "@/lib/session/store";
import { TssClient } from "@/lib/tss/client";
import { SESSION_COOKIE_NAME } from "@/lib/tss/constants";
import { isSessionExpiredError } from "@/lib/tss/errors";
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

    const courses = await new TssClient().searchCourses(
      parsed.data,
      session.credentials,
    );
    return NextResponse.json<CourseSearchResponse>({ courses });
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

function createSessionStoreSafely(): () => ReturnType<
  typeof createSessionStore
> {
  let store: ReturnType<typeof createSessionStore> | undefined;
  return () => (store ??= createSessionStore());
}
