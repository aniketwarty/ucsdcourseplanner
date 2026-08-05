import { SessionExpiredError, UpstreamError } from "./errors";

export interface EmbeddedHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export function getMultipartBoundary(contentType: string | null): string {
  const match = contentType?.match(
    /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i,
  );
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) {
    throw new UpstreamError(
      `batch: missing multipart boundary (ct=${contentType ?? "none"})`,
    );
  }
  return boundary;
}

export function parseMultipartHttpResponses(
  payload: string,
  boundary: string,
): EmbeddedHttpResponse[] {
  const delimiter = `--${boundary}`;
  const parts = payload
    .split(delimiter)
    .slice(1)
    .filter((part) => !part.trimStart().startsWith("--"));
  const responses: EmbeddedHttpResponse[] = [];

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    const outerBreak = findHeaderBreak(part);
    if (!outerBreak) continue;

    const outerHeaders = parseHeaders(part.slice(0, outerBreak.index));
    const partBody = part.slice(outerBreak.index + outerBreak.length);
    const nestedType = outerHeaders["content-type"];

    if (nestedType?.toLowerCase().startsWith("multipart/")) {
      responses.push(
        ...parseMultipartHttpResponses(
          partBody,
          getMultipartBoundary(nestedType),
        ),
      );
      continue;
    }

    const statusMatch = partBody.match(
      /(?:^|\r?\n)HTTP\/\d(?:\.\d)?\s+(\d{3})[^\r\n]*/i,
    );
    if (!statusMatch || statusMatch.index === undefined) continue;

    const responseStart = partBody.indexOf("HTTP/", statusMatch.index);
    if (responseStart < 0) {
      throw new UpstreamError("batch: embedded HTTP status line incomplete");
    }
    const statusLineEnd = partBody.indexOf("\n", responseStart);
    if (statusLineEnd < 0) {
      throw new UpstreamError("batch: embedded HTTP headers incomplete");
    }

    const afterStatus = partBody.slice(statusLineEnd + 1);
    const responseBreak = findHeaderBreak(afterStatus);
    const headers = responseBreak
      ? parseHeaders(afterStatus.slice(0, responseBreak.index))
      : {};
    const body = responseBreak
      ? afterStatus
          .slice(responseBreak.index + responseBreak.length)
          .replace(/\r?\n$/, "")
      : "";

    responses.push({
      status: Number(statusMatch[1]),
      headers,
      body,
    });
  }

  if (responses.length === 0) {
    throw new UpstreamError(
      `batch: no embedded HTTP responses (payload=${snippet(payload)})`,
    );
  }
  return responses;
}

export function parseBatchJson(payload: string, contentType: string | null): unknown {
  const responses = parseMultipartHttpResponses(
    payload,
    getMultipartBoundary(contentType),
  );
  const response = responses[0];

  if (response.status === 401 || response.status === 403) {
    throw new SessionExpiredError();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new UpstreamError(
      `batch embedded HTTP ${response.status}: ${snippet(response.body)}`,
    );
  }

  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw new UpstreamError(
      `batch: embedded body is not JSON: ${snippet(response.body)}`,
    );
  }
}

function findHeaderBreak(
  value: string,
): { index: number; length: number } | null {
  const crlf = value.indexOf("\r\n\r\n");
  const lf = value.indexOf("\n\n");
  if (crlf >= 0 && (lf < 0 || crlf <= lf)) {
    return { index: crlf, length: 4 };
  }
  if (lf >= 0) return { index: lf, length: 2 };
  return null;
}

function parseHeaders(headerBlock: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of headerBlock.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line
      .slice(colon + 1)
      .trim();
  }
  return headers;
}

function snippet(value: string, max = 240): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max)}…`;
}
