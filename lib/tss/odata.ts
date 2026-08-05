import { AppError } from "./errors";
import { COURSE_RESULT_LIMIT, SAP_CLIENT } from "./constants";
import type { AcademicTerm } from "./terms";

const MODULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~/-]{0,127}$/;
const COURSE_SELECT_FIELDS = [
  "AcademicLevel",
  "AcademicPeriod",
  "AcademicYear",
  "CourseAbbr",
  "CourseTitle",
  "CreditsDisplay",
  "DepartmentAbbr",
  "DepartmentText",
  "ModuleID",
  "incrementDisplay",
].join(",");

export function assertModuleId(moduleId: string): string {
  if (!MODULE_ID_PATTERN.test(moduleId)) {
    throw new AppError(
      "INVALID_MODULE_ID",
      "The course module identifier is invalid.",
      400,
    );
  }
  return moduleId;
}

export function escapeODataString(value: string): string {
  return value.replaceAll("'", "''");
}

/** TSS $filter / Term IDs use a 3-digit AcademicPeriod (Fall = 002). */
export function formatAcademicPeriod(period: number): string {
  return String(period).padStart(3, "0");
}

export function buildCourseSearchPath(
  query: string,
  term: AcademicTerm,
): string {
  const searchPhrase = query
    .trim()
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  const filter =
    `AcademicYear eq '${term.academicYear}' ` +
    `and AcademicPeriod eq '${formatAcademicPeriod(term.academicPeriod)}'`;

  const params = new URLSearchParams({
    "sap-client": SAP_CLIENT,
    "$count": "true",
    "$search": `"${searchPhrase}"`,
    "$filter": filter,
    "$select": COURSE_SELECT_FIELDS,
    "$skip": "0",
    "$top": String(COURSE_RESULT_LIMIT),
  });
  return `YUCSD_CON_MODULE?${params.toString()}`;
}

export function buildSectionsPath(
  moduleId: string,
  term: AcademicTerm,
): string {
  const safeModuleId = assertModuleId(moduleId);
  const keys = [
    `AcademicYear='${term.academicYear}'`,
    `AcademicPeriod='${term.academicPeriod}'`,
    `ModuleID='${encodeURIComponent(safeModuleId)}'`,
  ].join(",");
  return `YUCSD_CON_MODULE(${keys})/_sections?sap-client=${SAP_CLIENT}&$skip=0&$top=1000`;
}

export function buildAppointmentPeriodsPath(term: AcademicTerm): string {
  const filter =
    `academicYear eq '${escapeODataString(String(term.academicYear))}' ` +
    `and academicSession eq '${escapeODataString(String(term.academicPeriod))}'`;
  const params = new URLSearchParams({
    "sap-client": SAP_CLIENT,
    "$expand": "appointmentTimes,maxUnits",
    "$filter": filter,
    "$skip": "0",
    "$top": "100",
  });
  return `apptPeriods?${params.toString()}`;
}

export function buildBatchBody(
  relativePath: string,
  boundary: string,
  csrfToken?: string,
): string {
  // Match Fiori's compact multipart/http framing (no spaces after header colons).
  const embeddedHeaders = [
    `GET ${relativePath} HTTP/1.1`,
    "Accept:application/json;odata.metadata=minimal;IEEE754Compatible=true",
    "Accept-Language:en",
    ...(csrfToken ? [`X-CSRF-Token:${csrfToken}`] : []),
    "Content-Type:application/json;charset=UTF-8;IEEE754Compatible=true",
  ];

  return [
    `--${boundary}`,
    "Content-Type:application/http",
    "Content-Transfer-Encoding:binary",
    "",
    ...embeddedHeaders,
    "",
    "",
    `--${boundary}--`,
    "Group ID: $auto.Workers",
  ].join("\r\n");
}
