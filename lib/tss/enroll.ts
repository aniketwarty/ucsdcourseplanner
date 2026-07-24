/**
 * Build a TSS Fiori deep-link to an Event Package detail page.
 *
 * Example:
 * https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD&/Detail/EventPackage/SM/9273/00000000/0/0/0/00000000-0000-0000-0000-000000000000/154554/2026/2/
 *
 * Segments: SM (Study Module) / ModuleID / placeholders / EventPkgObjid / year / period
 */

const TSS_EVENT_PACKAGE_BASE =
  "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD&/Detail/EventPackage";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export type EventPackageLinkInput = {
  moduleId: string;
  eventPkgObjid: string;
  academicYear: string | number;
  academicPeriod: string | number;
};

export function normalizeEventPkgObjid(eventPkgObjid: string): string {
  const trimmed = eventPkgObjid.trim();
  // Some payloads zero-pad numeric object ids; strip leading zeros for the URL.
  if (/^\d+$/.test(trimmed)) return String(Number(trimmed));
  return trimmed;
}

export function buildEventPackageUrl(
  input: EventPackageLinkInput,
): string | null {
  const moduleId = input.moduleId.trim();
  const eventPkgObjid = normalizeEventPkgObjid(input.eventPkgObjid);
  const academicYear = String(input.academicYear).trim();
  const academicPeriod = String(input.academicPeriod).trim();

  if (!moduleId || !eventPkgObjid || !academicYear || !academicPeriod) {
    return null;
  }

  return [
    TSS_EVENT_PACKAGE_BASE,
    "SM",
    encodeURIComponent(moduleId),
    "00000000",
    "0",
    "0",
    "0",
    NIL_UUID,
    encodeURIComponent(eventPkgObjid),
    encodeURIComponent(academicYear),
    encodeURIComponent(academicPeriod),
    "",
  ].join("/");
}

export function buildPlannedPackageEnrollUrl(input: {
  course: {
    moduleId: string;
    academicYear: string | number;
    academicPeriod: string | number;
  };
  section: { eventPkgObjid?: string };
}): string | null {
  return buildEventPackageUrl({
    moduleId: input.course.moduleId,
    eventPkgObjid: input.section.eventPkgObjid ?? "",
    academicYear: input.course.academicYear,
    academicPeriod: input.course.academicPeriod,
  });
}
