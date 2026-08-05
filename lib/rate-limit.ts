import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import type { NextRequest } from "next/server";

import { AppError } from "@/lib/tss/errors";
import {
  createRedisClient,
  isValidSessionId,
} from "@/lib/session/store";

export type RateLimitKind = "auth" | "search" | "sections" | "appointments";

const LIMITS: Record<
  RateLimitKind,
  { requests: number; window: `${number} ${"s" | "m" | "h" | "d"}` }
> = {
  auth: { requests: 30, window: "10 m" },
  search: { requests: 60, window: "1 m" },
  sections: { requests: 90, window: "1 m" },
  appointments: { requests: 30, window: "1 m" },
};

export async function enforceRateLimit(
  request: NextRequest,
  kind: RateLimitKind,
  sessionId?: string,
): Promise<void> {
  const limit = LIMITS[kind];
  const ratelimit = new Ratelimit({
    redis: createRedisClient(),
    limiter: Ratelimit.slidingWindow(limit.requests, limit.window),
    prefix: `ucsd-planner:ratelimit:${kind}`,
    analytics: false,
  });

  const identifier = sessionId && isValidSessionId(sessionId)
    ? `session:${sessionId}`
    : `ip:${getClientIp(request)}`;
  const result = await ratelimit.limit(identifier);
  if (!result.success) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests. Please try again later.",
      429,
    );
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",", 1)[0].trim() || "unknown";
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-vercel-forwarded-for") ??
    "unknown"
  );
}
