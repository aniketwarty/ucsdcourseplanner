/**
 * Build a TSS Fiori deep-link to an Event Package detail page.
 *
 * Example:
 * https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD&/Detail/EventPackage/SM/9273/00000000/0/0/0/00000000-0000-0000-0000-000000000000/154554/2026/2/
 *
 * Segments: SM (Study Module) / ModuleID / placeholders / EventID / year / period
 */

const TSS_EVENT_PACKAGE_BASE =
  "https://tss.ucsd.edu/fiori#ZUSModule-display?TileType=MYMOD&/Detail/EventPackage";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export type EventPackageLinkInput = {
  moduleId: string;
  eventId: string;
  academicYear: string | number;
  academicPeriod: string | number;
};

export function normalizeEventId(eventId: string): string {
  const trimmed = eventId.trim();
  const prefixed = trimmed.match(/^E\s+(\d+)$/i);
  if (prefixed) return String(Number(prefixed[1]));
  return trimmed;
}

export function buildEventPackageUrl(
  input: EventPackageLinkInput,
): string | null {
  const moduleId = input.moduleId.trim();
  const eventId = normalizeEventId(input.eventId);
  const academicYear = String(input.academicYear).trim();
  const academicPeriod = String(input.academicPeriod).trim();

  if (!moduleId || !eventId || !academicYear || !academicPeriod) {
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
    encodeURIComponent(eventId),
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
  section: { meetings: Array<{ eventId: string }> };
}): string | null {
  const eventId =
    input.section.meetings.find((meeting) => meeting.eventId.trim())
      ?.eventId ?? "";

  return buildEventPackageUrl({
    moduleId: input.course.moduleId,
    eventId,
    academicYear: input.course.academicYear,
    academicPeriod: input.course.academicPeriod,
  });
}
