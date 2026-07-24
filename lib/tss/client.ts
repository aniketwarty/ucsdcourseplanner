import "server-only";

import { randomUUID } from "node:crypto";

import type { TssCredentials } from "./auth";
import {
  getSetCookieHeaders,
  mergeCookieHeaders,
} from "./auth";
import {
  COURSE_RESULT_LIMIT,
  SAP_CLIENT,
  TSS_BASE_URL,
  TSS_TIMEOUT_MS,
} from "./constants";
import {
  SessionExpiredError,
  UpstreamError,
} from "./errors";
import { parseBatchJson } from "./multipart";
import {
  buildBatchBody,
  buildCourseSearchPath,
  buildSectionsPath,
} from "./odata";
import { mapSectionGroups } from "./schedule";
import type { AcademicTerm } from "./terms";
import type { Course, SectionGroup } from "./types";

type TssRecord = Record<string, unknown>;

export interface TssFetch {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

const TSS_ORIGIN = "https://tss.ucsd.edu";
const TSS_FIORI_REFERER = `${TSS_ORIGIN}/fiori`;

export class TssClient {
  constructor(private readonly fetchImpl: TssFetch = fetch) {}

  async fetchCsrfToken(cookie: string): Promise<TssCredentials> {
    // Warm ALB sticky cookies, then fetch CSRF with the merged jar.
    const warmedCookie = await this.warmSessionCookies(cookie);
    const response = await this.request(
      `${TSS_BASE_URL}/?sap-client=${SAP_CLIENT}`,
      {
        method: "GET",
        headers: this.headers({
          Accept: "application/json",
          Cookie: warmedCookie,
          "X-CSRF-Token": "Fetch",
        }),
      },
    );
    assertAuthenticatedUpstream(response);

    const csrfToken = response.headers.get("x-csrf-token");
    if (!csrfToken) throw new SessionExpiredError();

    return {
      cookie: mergeCookieHeaders(
        warmedCookie,
        getSetCookieHeaders(response.headers),
      ),
      csrfToken,
    };
  }

  async searchCourses(
    query: string,
    credentials: TssCredentials,
    term: AcademicTerm,
  ): Promise<Course[]> {
    const boundary = `batch_${randomUUID().replaceAll("-", "")}`;
    const body = buildBatchBody(buildCourseSearchPath(query, term), boundary);
    const response = await this.request(
      `${TSS_BASE_URL}/$batch?sap-client=${SAP_CLIENT}`,
      {
        method: "POST",
        headers: this.headers({
          Accept: "multipart/mixed",
          "Content-Type": `multipart/mixed; boundary=${boundary}`,
          Cookie: credentials.cookie,
          "X-CSRF-Token": credentials.csrfToken,
        }),
        body,
      },
    );
    assertAuthenticatedUpstream(response);

    const payload = parseBatchJson(
      await response.text(),
      response.headers.get("content-type"),
    );
    return mapCourses(payload, term).slice(0, COURSE_RESULT_LIMIT);
  }

  async getSections(
    moduleId: string,
    credentials: TssCredentials,
    term: AcademicTerm,
  ): Promise<SectionGroup[]> {
    const response = await this.request(
      `${TSS_BASE_URL}/${buildSectionsPath(moduleId, term)}`,
      {
        method: "GET",
        headers: this.headers({
          Accept: "application/json",
          Cookie: credentials.cookie,
          "X-CSRF-Token": credentials.csrfToken,
        }),
      },
    );
    assertAuthenticatedUpstream(response);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      throw new SessionExpiredError();
    }

    try {
      return mapSectionGroups(await response.json());
    } catch (error) {
      if (error instanceof UpstreamError || error instanceof SessionExpiredError) {
        throw error;
      }
      throw new UpstreamError();
    }
  }

  private async warmSessionCookies(cookie: string): Promise<string> {
    const response = await this.request(`${TSS_FIORI_REFERER}?sap-client=${SAP_CLIENT}`, {
      method: "GET",
      headers: this.headers({
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: cookie,
      }),
    });
    // Fiori may return login HTML or 401 when the jar is incomplete; still keep
    // any ALB/SAP cookies the front door sets so the CSRF call can reuse them.
    if (response.status === 401 || response.status === 403) {
      throw new SessionExpiredError();
    }
    return mergeCookieHeaders(cookie, getSetCookieHeaders(response.headers));
  }

  private headers(extra: Record<string, string>): Record<string, string> {
    return {
      Origin: TSS_ORIGIN,
      Referer: TSS_FIORI_REFERER,
      "X-Requested-With": "XMLHttpRequest",
      ...extra,
    };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(TSS_TIMEOUT_MS),
      });
    } catch {
      throw new UpstreamError();
    }
  }
}

export function mapCourses(data: unknown, term: AcademicTerm): Course[] {
  return extractRecords(data)
    .map((record): Course | null => {
      const moduleId = text(record, "ModuleID", "ModuleId", "moduleId");
      if (!moduleId) return null;

      const courseAbbr =
        text(
          record,
          "CourseAbbr",
          "ModuleAbbr",
          "ModuleCode",
          "CourseCode",
        ) || moduleId;
      const courseTitle =
        text(
          record,
          "CourseTitle",
          "ModuleText",
          "ModuleTitle",
          "ModuleShortText",
          "Title",
        ) || courseAbbr;

      return {
        academicYear: term.academicYear,
        academicPeriod: term.academicPeriod,
        academicYearText: term.academicYearText,
        academicPeriodText: term.academicPeriodText,
        moduleId,
        academicLevel: text(record, "AcademicLevel", "AcadLevel"),
        departmentAbbr: text(
          record,
          "DepartmentAbbr",
          "DepartmentCode",
          "OrgUnitAbbr",
        ),
        departmentText: text(
          record,
          "DepartmentText",
          "DepartmentName",
          "OrgUnitText",
        ),
        courseAbbr,
        courseTitle,
        credits:
          number(
            record,
            "CreditsDisplay",
            "Credits",
            "Units",
            "CreditValue",
          ) ??
          (text(
            record,
            "CreditsDisplay",
            "Credits",
            "Units",
            "CreditValue",
          ) || 0),
        incrementDisplay: text(
          record,
          "incrementDisplay",
          "IncrementDisplay",
          "CreditIncrementDisplay",
        ),
        description:
          text(record, "ModuleDesc", "ModuleDescription", "Description") ||
          null,
      };
    })
    .filter((course): course is Course => course !== null);
}

function assertAuthenticatedUpstream(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new SessionExpiredError();
  }
  if (response.status >= 300 && response.status < 400) {
    // SSO bounce / login redirect — treat as an unusable session jar.
    throw new SessionExpiredError();
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new SessionExpiredError();
  }
  if (!response.ok) throw new UpstreamError();
}

function extractRecords(data: unknown): TssRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.value)) return data.value.filter(isRecord);
  if (isRecord(data.d) && Array.isArray(data.d.results)) {
    return data.d.results.filter(isRecord);
  }
  return [];
}

function isRecord(value: unknown): value is TssRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(record: TssRecord, ...fields: string[]): string {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function number(record: TssRecord, ...fields: string[]): number | null {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}
