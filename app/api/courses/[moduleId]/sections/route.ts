import { type NextRequest, NextResponse } from "next/server";

import {
  clearSessionCookie,
  errorResponse,
} from "@/lib/api/responses";
import { requireRequestSession } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSessionStore } from "@/lib/session/store";
import { TssClient } from "@/lib/tss/client";
import { FIXED_TERM, SESSION_COOKIE_NAME } from "@/lib/tss/constants";
import { AppError, isSessionExpiredError } from "@/lib/tss/errors";
import { assertModuleId } from "@/lib/tss/odata";
import type { SectionsResponse } from "@/lib/tss/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SectionsContext {
  params: Promise<{ moduleId: string }>;
}

export async function GET(
  request: NextRequest,
  context: SectionsContext,
) {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let store: ReturnType<typeof createSessionStore> | undefined;

  try {
    await enforceRateLimit(request, "sections", sessionId);
    store = createSessionStore();
    const session = await requireRequestSession(request, store);

    validateTerm(request.nextUrl.searchParams);

    const { moduleId } = await context.params;
    assertModuleId(moduleId);

    const sections = await new TssClient().getSections(
      moduleId,
      session.credentials,
    );
    return NextResponse.json<SectionsResponse>({ sections });
  } catch (error) {
    const response = errorResponse(error);
    if (isSessionExpiredError(error)) {
      if (sessionId) {
        try {
          store ??= createSessionStore();
          await store.delete(sessionId);
        } catch {
          // Preserve the original sanitized upstream error.
        }
      }
      clearSessionCookie(response);
    }
    return response;
  }
}

function validateTerm(searchParams: URLSearchParams): void {
  const year = searchParams.get("year");
  const period = searchParams.get("period");
  if (
    (year !== null && year !== String(FIXED_TERM.academicYear)) ||
    (period !== null && period !== String(FIXED_TERM.academicPeriod))
  ) {
    throw new AppError(
      "UNSUPPORTED_TERM",
      "Only Fall Quarter 2026 is supported.",
      400,
    );
  }
}
