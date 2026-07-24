import "server-only";

import { SAP_CLIENT } from "./constants";
import { AppError } from "./errors";

export const SAP_SESSION_COOKIE = "SAP_SESSIONID_S4P_500";
export const SAP_USER_CONTEXT_COOKIE = "sap-usercontext";
/** Full browser Cookie headers from TSS now include ALB + SAP blobs. */
export const MAX_COOKIE_HEADER_LENGTH = 48_192;

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_VALUE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;

export interface TssCredentials {
  cookie: string;
  csrfToken: string;
}

export function normalizeTssCookie(input: string): string {
  if (typeof input !== "string" || input.length === 0 || /[\r\n]/.test(input)) {
    throw invalidCookie();
  }

  let trimmed = input.trim();
  if (!trimmed) throw invalidCookie();

  // Allow pasting the raw request header: `Cookie: a=b; c=d`
  trimmed = trimmed.replace(/^Cookie:\s*/i, "").trim();
  if (!trimmed || trimmed.length > MAX_COOKIE_HEADER_LENGTH) {
    throw invalidCookie();
  }

  if (!trimmed.includes("=")) {
    assertCookieValue(trimmed);
    return ensureSapUserContext(`${SAP_SESSION_COOKIE}=${trimmed}`);
  }

  const cookies = trimmed.split(";").map((part) => part.trim()).filter(Boolean);
  let hasSapSession = false;
  const values = new Map<string, string>();

  for (const cookie of cookies) {
    const equals = cookie.indexOf("=");
    if (equals <= 0) throw invalidCookie();

    const name = cookie.slice(0, equals).trim();
    const value = cookie.slice(equals + 1).trim();
    if (!COOKIE_NAME.test(name)) throw invalidCookie();
    assertCookieValue(value);
    if (name === SAP_SESSION_COOKIE && value.length > 0) {
      hasSapSession = true;
    }
    values.set(name, value);
  }

  if (!hasSapSession) throw invalidCookie();

  return ensureSapUserContext(
    [...values.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
  );
}

export function ensureSapUserContext(cookieHeader: string): string {
  if (/(?:^|;)\s*sap-usercontext=/i.test(cookieHeader)) {
    return cookieHeader;
  }
  return `${cookieHeader}; ${SAP_USER_CONTEXT_COOKIE}=sap-client=${SAP_CLIENT}`;
}

export function mergeCookieHeaders(
  originalCookie: string,
  setCookieHeaders: string[],
): string {
  const values = new Map<string, string>();

  for (const item of originalCookie.split(";")) {
    addCookiePair(values, item);
  }
  for (const header of setCookieHeaders) {
    const pair = header.split(";", 1)[0];
    addCookiePair(values, pair);
  }

  return ensureSapUserContext(
    [...values.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
  );
}

export function getSetCookieHeaders(headers: Headers): string[] {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof extendedHeaders.getSetCookie === "function") {
    return extendedHeaders.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  if (!combined) return [];

  return combined.split(
    /,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/,
  );
}

function addCookiePair(values: Map<string, string>, pair: string): void {
  const trimmed = pair.trim();
  const equals = trimmed.indexOf("=");
  if (equals <= 0) return;
  const name = trimmed.slice(0, equals).trim();
  const value = trimmed.slice(equals + 1).trim();
  if (COOKIE_NAME.test(name) && COOKIE_VALUE.test(value)) {
    values.set(name, value);
  }
}

function assertCookieValue(value: string): void {
  if (!value || !COOKIE_VALUE.test(value)) {
    throw invalidCookie();
  }
}

function invalidCookie(): AppError {
  return new AppError(
    "INVALID_COOKIE",
    "The supplied UCSD session cookie is invalid.",
    400,
  );
}
