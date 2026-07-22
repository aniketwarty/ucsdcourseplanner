import { AppError } from "./errors";
import {
  COURSE_RESULT_LIMIT,
  FIXED_TERM,
  SAP_CLIENT,
} from "./constants";

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

export function buildCourseSearchPath(query: string): string {
  const searchPhrase = query
    .trim()
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  const filter =
    `AcYearText eq '${escapeODataString(FIXED_TERM.academicYearText)}' ` +
    `and AcademicPeriodText eq '${escapeODataString(FIXED_TERM.academicPeriodText)}'`;

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

export function buildSectionsPath(moduleId: string): string {
  const safeModuleId = assertModuleId(moduleId);
  const keys = [
    `AcademicYear='${FIXED_TERM.academicYear}'`,
    `AcademicPeriod='${FIXED_TERM.academicPeriod}'`,
    `ModuleID='${encodeURIComponent(safeModuleId)}'`,
  ].join(",");
  return `YUCSD_CON_MODULE(${keys})/_sections?sap-client=${SAP_CLIENT}&$skip=0&$top=1000`;
}

export function buildBatchBody(
  relativePath: string,
  boundary: string,
): string {
  return [
    `--${boundary}`,
    "Content-Type: application/http",
    "Content-Transfer-Encoding: binary",
    "",
    `GET ${relativePath} HTTP/1.1`,
    "Accept:application/json;odata.metadata=minimal;IEEE754Compatible=true",
    "Accept-Language:en-US",
    "Content-Type:application/json;charset=UTF-8;IEEE754Compatible=true",
    "",
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
