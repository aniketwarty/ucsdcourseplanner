import "server-only";

import type { NextRequest } from "next/server";

import { AppError } from "@/lib/tss/errors";

/**
 * Reject cross-site state-changing requests (defense in depth beyond SameSite).
 * Allows same-origin browser fetches and non-browser clients that omit Origin.
 */
export function assertSameOrigin(request: NextRequest): void {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") {
    throw forbidden();
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    throw forbidden();
  }
}

function forbidden(): AppError {
  return new AppError(
    "FORBIDDEN",
    "Cross-site requests are not allowed.",
    403,
  );
}
