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
  TSS_APPT_BASE_URL,
  TSS_BASE_URL,
  TSS_TIMEOUT_MS,
} from "./constants";
import {
  SessionExpiredError,
  UpstreamError,
} from "./errors";
import { parseBatchJson } from "./multipart";
import {
  buildAppointmentPeriodsPath,
  buildBatchBody,
  buildCourseSearchPath,
  buildSectionsPath,
} from "./odata";
import { mapSectionGroups } from "./schedule";
import type { AcademicTerm } from "./terms";
import type {
  AppointmentPass,
  AppointmentPassStatus,
  AppointmentTimesResponse,
  Course,
  SectionGroup,
} from "./types";

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
    assertAuthenticatedUpstream(response, "csrf");

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
    const boundary = `batch_id-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const path = buildCourseSearchPath(query, term);
    const body = buildBatchBody(path, boundary, credentials.csrfToken);
    const response = await this.request(
      `${TSS_BASE_URL}/$batch?sap-client=${SAP_CLIENT}`,
      {
        method: "POST",
        headers: this.headers({
          Accept: "multipart/mixed",
          "Accept-Language": "en",
          "Content-Type": `multipart/mixed; boundary=${boundary}`,
          "MIME-Version": "1.0",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Cookie: credentials.cookie,
          "X-CSRF-Token": credentials.csrfToken,
        }),
        body,
      },
    );
    assertAuthenticatedUpstream(response, "course-search");

    const payload = parseBatchJson(
      await response.text(),
      response.headers.get("content-type"),
    );
    const odataError = extractODataError(payload);
    if (odataError) {
      throw new UpstreamError(`course-search: ${odataError}`);
    }
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
    assertAuthenticatedUpstream(response, "sections");

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
      throw new UpstreamError(
        `sections-parse: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  async getAppointmentTimes(
    credentials: TssCredentials,
    term: AcademicTerm,
  ): Promise<AppointmentTimesResponse> {
    const response = await this.request(
      `${TSS_APPT_BASE_URL}/${buildAppointmentPeriodsPath(term)}`,
      {
        method: "GET",
        headers: this.headers({
          Accept:
            "application/json;odata.metadata=minimal;IEEE754Compatible=true",
          Cookie: credentials.cookie,
          "X-CSRF-Token": credentials.csrfToken,
        }),
      },
    );
    assertAuthenticatedUpstream(response, "appointments");

    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new UpstreamError(
        `appointments: non-JSON body ct=${response.headers.get("content-type")} body=${snippet(text)}`,
      );
    }

    const odataError = extractODataError(payload);
    if (odataError) {
      throw new UpstreamError(`appointments: ${odataError}`);
    }

    return mapAppointmentTimes(payload, term);
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
    } catch (error) {
      const reason =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : "unknown network error";
      throw new UpstreamError(`fetch failed for ${url}: ${reason}`);
    }
  }
}

export function mapAppointmentTimes(
  data: unknown,
  term: AcademicTerm,
  now: Date = new Date(),
): AppointmentTimesResponse {
  const periods = extractRecords(data);
  const period = periods[0];
  if (!period) {
    return {
      academicYearText: term.academicYearText,
      academicSessionText: term.academicPeriodText,
      passes: [],
      hasActiveHolds: false,
      hasFutureHolds: false,
      sessionNote: "",
    };
  }

  const academicYearText =
    text(period, "academicYearText") || term.academicYearText;
  const academicSessionText =
    text(period, "academicSessionText", "academicSession_Text") ||
    term.academicPeriodText;
  const sessionPeriod = text(period, "academicSession") || String(term.academicPeriod);

  const maxUnitsByTimelimit = new Map<string, string>();
  const maxUnits = Array.isArray(period.maxUnits)
    ? period.maxUnits.filter(isRecord)
    : [];
  for (const row of maxUnits) {
    const perid = text(row, "Perid", "perid");
    if (perid && perid !== sessionPeriod) continue;
    const timelimit = text(row, "Timelimit", "timelimit");
    const units = text(row, "MaxUnits", "maxUnits");
    if (timelimit && units) maxUnitsByTimelimit.set(timelimit, units);
  }

  const appointmentTimes = Array.isArray(period.appointmentTimes)
    ? period.appointmentTimes.filter(isRecord)
    : [];

  const passes: AppointmentPass[] = appointmentTimes
    .map((record, index): AppointmentPass | null => {
      const beginTimestamp = text(record, "beginTimestamp");
      const endTimestamp = text(record, "endTimestamp");
      if (!beginTimestamp || !endTimestamp) return null;

      const timelimit = text(record, "timelimit");
      const label =
        text(record, "timelimit_Text", "timelimitText") ||
        (timelimit ? `Pass ${timelimit}` : "Appointment");
      const bkgWindow = text(record, "bkgWindow");

      return {
        id: `${timelimit || "pass"}-${beginTimestamp}-${index}`,
        label,
        beginTimestamp,
        endTimestamp,
        waitlists: text(record, "waitlists") || "—",
        unitCap: timelimit
          ? (maxUnitsByTimelimit.get(timelimit) ?? null)
          : null,
        status: passStatus(beginTimestamp, endTimestamp, now),
        bkgWindow,
      };
    })
    .filter((pass): pass is AppointmentPass => pass !== null)
    .sort((a, b) => a.beginTimestamp.localeCompare(b.beginTimestamp));

  const countCurrent = number(period, "countCurrent") ?? 0;
  const countFuture = number(period, "countFuture") ?? 0;
  const holdLevel = text(period, "holdLevel");

  return {
    academicYearText:
      text(
        appointmentTimes[0] ?? {},
        "academicYear_Text",
        "academicYearText",
      ) || academicYearText,
    academicSessionText:
      text(
        appointmentTimes[0] ?? {},
        "academicSession_Text",
        "academicSessionText",
      ) || academicSessionText,
    passes,
    hasActiveHolds: countCurrent > 0 || Boolean(holdLevel),
    hasFutureHolds: countFuture > 0,
    sessionNote: text(period, "sessionNote"),
  };
}

function passStatus(
  beginTimestamp: string,
  endTimestamp: string,
  now: Date,
): AppointmentPassStatus {
  const begin = Date.parse(beginTimestamp);
  const end = Date.parse(endTimestamp);
  const current = now.getTime();
  if (!Number.isFinite(begin) || !Number.isFinite(end)) return "upcoming";
  if (current < begin) return "upcoming";
  if (current > end) return "ended";
  return "active";
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

function assertAuthenticatedUpstream(
  response: Response,
  stage = "upstream",
  bodyText?: string,
): void {
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
  if (!response.ok) {
    let detail = `${stage}: HTTP ${response.status} ct=${contentType || "none"}`;
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText) as unknown;
        const odataError = extractODataError(parsed);
        if (odataError) detail = `${stage}: ${odataError}`;
        else detail = `${detail} body=${snippet(bodyText)}`;
      } catch {
        detail = `${detail} body=${snippet(bodyText)}`;
      }
    }
    throw new UpstreamError(detail);
  }
}

function extractODataError(data: unknown): string | null {
  if (!isRecord(data) || !isRecord(data.error)) return null;
  const code =
    typeof data.error.code === "string" ? data.error.code : "unknown";
  const message =
    typeof data.error.message === "string"
      ? data.error.message
      : isRecord(data.error.message) &&
          typeof data.error.message.value === "string"
        ? data.error.message.value
        : JSON.stringify(data.error).slice(0, 400);
  return `${code}: ${message}`;
}

function snippet(value: string, max = 240): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max)}…`;
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
