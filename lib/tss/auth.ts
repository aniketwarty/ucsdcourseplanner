import "server-only";

import { AppError } from "./errors";

const SAP_SESSION_COOKIE = "SAP_SESSIONID_S4P_500";
const MAX_COOKIE_HEADER_LENGTH = 8_192;
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_VALUE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;

export interface TssCredentials {
  cookie: string;
  csrfToken: string;
}

export function normalizeTssCookie(input: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > MAX_COOKIE_HEADER_LENGTH ||
    /[\r\n]/.test(input)
  ) {
    throw new AppError(
      "INVALID_COOKIE",
      "The supplied UCSD session cookie is invalid.",
      400,
    );
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new AppError(
      "INVALID_COOKIE",
      "The supplied UCSD session cookie is invalid.",
      400,
    );
  }

  if (!trimmed.includes("=")) {
    assertCookieValue(trimmed);
    return `${SAP_SESSION_COOKIE}=${trimmed}`;
  }

  const cookies = trimmed.split(";").map((part) => part.trim());
  let hasSapSession = false;

  const normalized = cookies.map((cookie) => {
    const equals = cookie.indexOf("=");
    if (equals <= 0) {
      throw invalidCookie();
    }

    const name = cookie.slice(0, equals).trim();
    const value = cookie.slice(equals + 1).trim();
    if (!COOKIE_NAME.test(name)) {
      throw invalidCookie();
    }
    assertCookieValue(value);
    if (name === SAP_SESSION_COOKIE && value.length > 0) {
      hasSapSession = true;
    }
    return `${name}=${value}`;
  });

  if (!hasSapSession) {
    throw invalidCookie();
  }

  return normalized.join("; ");
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

  return [...values.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
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
