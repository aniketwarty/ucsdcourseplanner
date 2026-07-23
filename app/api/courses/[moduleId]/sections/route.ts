import { type NextRequest, NextResponse } from "next/server";

import {
  clearSessionCookie,
  errorResponse,
} from "@/lib/api/responses";
import { requireRequestSession } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSessionStore } from "@/lib/session/store";
import { TssClient } from "@/lib/tss/client";
import { SESSION_COOKIE_NAME } from "@/lib/tss/constants";
import { AppError, isSessionExpiredError } from "@/lib/tss/errors";
import { assertModuleId } from "@/lib/tss/odata";
import {
  getCurrentTerm,
  parseTermParams,
  type AcademicTerm,
} from "@/lib/tss/terms";
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

    const term = resolveTerm(request.nextUrl.searchParams);

    const { moduleId } = await context.params;
    assertModuleId(moduleId);

    const sections = await new TssClient().getSections(
      moduleId,
      session.credentials,
      term,
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
