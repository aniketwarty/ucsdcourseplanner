export type DayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export type Course = {
  academicYear: string | number;
  academicPeriod: string | number;
  moduleId: string;
  academicLevel: string;
  departmentAbbr: string;
  departmentText: string;
  courseAbbr: string;
  courseTitle: string;
  credits: string | number;
  incrementDisplay: string;
};

export type Meeting = {
  eventId: string;
  type: string;
  instructorName: string;
  instructorEmail: string;
  location: string;
  status: string;
  days: DayCode[];
  startTime: string | null;
  endTime: string | null;
  beginDate: string;
  endDate: string;
  rawSchedule: string;
  finalExam?: unknown;
};

export type FinalExam = {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  rawSchedule: string;
};

export type SectionGroup = {
  id: string;
  label: string;
  courseAbbr: string;
  capacity: number;
  seatsAvailable: number;
  waitlistCount: number;
  meetings: Meeting[];
  finalExam?: FinalExam | null;
};

export type PlannedPackage = {
  id: string;
  course: Course;
  section: SectionGroup;
  addedAt: string;
};

export type PlannerPayload = {
  version: 1;
  packages: PlannedPackage[];
};

export type CalendarEvent = {
  id: string;
  groupId: string;
  title: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startRecur: string;
  endRecur: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  classNames: string[];
  extendedProps: {
    packageId: string;
    courseAbbr: string;
    meetingType: string;
    location: string;
    instructor: string;
    conflict: boolean;
  };
};

const STORAGE_KEY = "ucsd-course-planner:v1";
const DAY_INDEX: Record<DayCode, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};
const COLORS = ["#00629b", "#173f5f", "#5b3f8c", "#287271", "#3d5a80"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDayCode(value: unknown): value is DayCode {
  return (
    value === "MO" ||
    value === "TU" ||
    value === "WE" ||
    value === "TH" ||
    value === "FR" ||
    value === "SA" ||
    value === "SU"
  );
}

function validDate(value: unknown): value is string {
  return isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value: unknown): value is string {
  return isString(value) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function sanitizeCourse(value: unknown): Course | null {
  if (!isRecord(value)) return null;
  const keys = [
    "moduleId",
    "academicLevel",
    "departmentAbbr",
    "departmentText",
    "courseAbbr",
    "courseTitle",
    "incrementDisplay",
  ] as const;
  if (!keys.every((key) => isString(value[key]))) return null;
  if (
    !(isString(value.academicYear) || isNumber(value.academicYear)) ||
    !(isString(value.academicPeriod) || isNumber(value.academicPeriod)) ||
    !(isString(value.credits) || isNumber(value.credits))
  ) {
    return null;
  }
  return value as Course;
}

function sanitizeMeeting(value: unknown): Meeting | null {
  if (!isRecord(value)) return null;
  const stringKeys = [
    "eventId",
    "type",
    "instructorName",
    "instructorEmail",
    "location",
    "status",
    "rawSchedule",
  ] as const;
  if (!stringKeys.every((key) => isString(value[key]))) return null;
  if (
    !Array.isArray(value.days) ||
    !value.days.every(isDayCode) ||
    !validDate(value.beginDate) ||
    !validDate(value.endDate) ||
    !(value.startTime === null || validTime(value.startTime)) ||
    !(value.endTime === null || validTime(value.endTime))
  ) {
    return null;
  }
  return {
    eventId: value.eventId as string,
    type: value.type as string,
    instructorName: value.instructorName as string,
    instructorEmail: value.instructorEmail as string,
    location: value.location as string,
    status: value.status as string,
    days: value.days as DayCode[],
    startTime: value.startTime as string | null,
    endTime: value.endTime as string | null,
    beginDate: value.beginDate as string,
    endDate: value.endDate as string,
    rawSchedule: value.rawSchedule as string,
    finalExam: value.finalExam,
  };
}

function sanitizeFinalExam(value: unknown): FinalExam | null {
  if (!isRecord(value)) return null;
  if (
    !(value.date === null || validDate(value.date)) ||
    !(value.startTime === null || validTime(value.startTime)) ||
    !(value.endTime === null || validTime(value.endTime)) ||
    !(value.location === null || isString(value.location)) ||
    !isString(value.rawSchedule)
  ) {
    return null;
  }
  return {
    date: value.date as string | null,
    startTime: value.startTime as string | null,
    endTime: value.endTime as string | null,
    location: value.location as string | null,
    rawSchedule: value.rawSchedule,
  };
}

function sanitizeSection(value: unknown): SectionGroup | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.id) ||
    !isString(value.label) ||
    !isString(value.courseAbbr) ||
    !isNumber(value.capacity) ||
    !isNumber(value.seatsAvailable) ||
    !isNumber(value.waitlistCount) ||
    !Array.isArray(value.meetings)
  ) {
    return null;
  }
  const meetings = value.meetings.map(sanitizeMeeting);
  if (meetings.some((meeting) => meeting === null)) return null;
  const finalExam =
    value.finalExam === null || value.finalExam === undefined
      ? value.finalExam
      : sanitizeFinalExam(value.finalExam);
  if (value.finalExam !== null && value.finalExam !== undefined && !finalExam) {
    return null;
  }
  return {
    id: value.id,
    label: value.label,
    courseAbbr: value.courseAbbr,
    capacity: value.capacity,
    seatsAvailable: value.seatsAvailable,
    waitlistCount: value.waitlistCount,
    meetings: meetings as Meeting[],
    finalExam,
  };
}

function sanitizePackage(value: unknown): PlannedPackage | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.addedAt)) {
    return null;
  }
  const course = sanitizeCourse(value.course);
  const section = sanitizeSection(value.section);
  if (!course || !section) return null;
  return { id: value.id, course, section, addedAt: value.addedAt };
}

export function makePackage(course: Course, section: SectionGroup): PlannedPackage {
  return {
    id: `${course.moduleId}:${section.id}`,
    course,
    section,
    addedAt: new Date().toISOString(),
  };
}

export function serializePlanner(packages: PlannedPackage[]): string {
  return JSON.stringify({ version: 1, packages } satisfies PlannerPayload);
}

export function deserializePlanner(serialized: string | null): PlannedPackage[] {
  if (!serialized) return [];
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.packages)) {
      return [];
    }
    const packages = value.packages
      .map(sanitizePackage)
      .filter((item): item is PlannedPackage => item !== null);
    return Array.from(new Map(packages.map((item) => [item.id, item])).values());
  } catch {
    return [];
  }
}

export function loadPlanner(storage: Pick<Storage, "getItem">): PlannedPackage[] {
  return deserializePlanner(storage.getItem(STORAGE_KEY));
}

export function savePlanner(
  storage: Pick<Storage, "setItem">,
  packages: PlannedPackage[],
): void {
  storage.setItem(STORAGE_KEY, serializePlanner(packages));
}

export function groupPlannedByCourse(packages: PlannedPackage[]) {
  const groups = new Map<string, { course: Course; packages: PlannedPackage[] }>();
  for (const item of packages) {
    const existing = groups.get(item.course.moduleId);
    if (existing) existing.packages.push(item);
    else groups.set(item.course.moduleId, { course: item.course, packages: [item] });
  }
  return Array.from(groups.values());
}

export function totalCredits(packages: PlannedPackage[]): number {
  return groupPlannedByCourse(packages).reduce((sum, group) => {
    const value = Number.parseFloat(String(group.course.credits));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function meetingsOverlap(a: Meeting, b: Meeting): boolean {
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return false;
  if (!a.days.some((day) => b.days.includes(day))) return false;
  if (a.endDate < b.beginDate || b.endDate < a.beginDate) return false;
  return (
    toMinutes(a.startTime) < toMinutes(b.endTime) &&
    toMinutes(b.startTime) < toMinutes(a.endTime)
  );
}

function scheduleMeetings(section: SectionGroup): Meeting[] {
  const exam = section.finalExam;
  if (!exam?.date || !exam.startTime || !exam.endTime) return section.meetings;
  const dayIndex = new Date(`${exam.date}T12:00:00Z`).getUTCDay();
  const day = (Object.keys(DAY_INDEX) as DayCode[]).find(
    (code) => DAY_INDEX[code] === dayIndex,
  );
  if (!day) return section.meetings;
  return [
    ...section.meetings,
    {
      eventId: `final-${exam.date}`,
      type: "Final exam",
      instructorName: "",
      instructorEmail: "",
      location: exam.location || "Location TBA",
      status: "",
      days: [day],
      startTime: exam.startTime,
      endTime: exam.endTime,
      beginDate: exam.date,
      endDate: exam.date,
      rawSchedule: exam.rawSchedule,
    },
  ];
}

export function detectConflicts(packages: PlannedPackage[]): Set<string> {
  const conflicts = new Set<string>();
  for (let left = 0; left < packages.length; left += 1) {
    for (let right = left + 1; right < packages.length; right += 1) {
      const a = packages[left];
      const b = packages[right];
      if (
        scheduleMeetings(a.section).some((meetingA) =>
          scheduleMeetings(b.section).some((meetingB) =>
            meetingsOverlap(meetingA, meetingB),
          ),
        )
      ) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function colorFor(value: string): string {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function toCalendarEvents(packages: PlannedPackage[]): CalendarEvent[] {
  const conflicts = detectConflicts(packages);
  return packages.flatMap((item) =>
    scheduleMeetings(item.section).flatMap((meeting, index) => {
      if (!meeting.startTime || !meeting.endTime || meeting.days.length === 0) {
        return [];
      }
      const conflict = conflicts.has(item.id);
      const color = conflict ? "#b42318" : colorFor(item.course.moduleId);
      return [
        {
          id: `${item.id}:${meeting.eventId || index}`,
          groupId: item.id,
          title: `${item.course.courseAbbr} · ${meeting.type}`,
          daysOfWeek: meeting.days.map((day) => DAY_INDEX[day]),
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          startRecur: meeting.beginDate,
          endRecur: addDays(meeting.endDate, 1),
          backgroundColor: color,
          borderColor: color,
          textColor: "#ffffff",
          classNames: conflict ? ["planner-event", "is-conflict"] : ["planner-event"],
          extendedProps: {
            packageId: item.id,
            courseAbbr: item.course.courseAbbr,
            meetingType: meeting.type,
            location: meeting.location,
            instructor: meeting.instructorName,
            conflict,
          },
        },
      ];
    }),
  );
}

function escapeIcs(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

function meetingOccurrences(meeting: Meeting): string[] {
  if (!meeting.startTime || !meeting.endTime || meeting.days.length === 0) return [];
  const dates: string[] = [];
  let cursor = meeting.beginDate;
  let guard = 0;
  while (cursor <= meeting.endDate && guard < 370) {
    const dayIndex = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    if (meeting.days.some((day) => DAY_INDEX[day] === dayIndex)) dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return dates;
}

function foldIcsLine(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  for (let index = 0; index < line.length; index += 73) {
    chunks.push(`${index === 0 ? "" : " "}${line.slice(index, index + 73)}`);
  }
  return chunks.join("\r\n");
}

export function generateIcs(packages: PlannedPackage[]): string {
  const created = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UCSD Course Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Fall 2026 Course Plan",
    "X-WR-TIMEZONE:America/Los_Angeles",
  ];
  for (const item of packages) {
    scheduleMeetings(item.section).forEach((meeting, meetingIndex) => {
      meetingOccurrences(meeting).forEach((date) => {
        const start = `${compactDate(date)}T${meeting.startTime!.replace(":", "")}00`;
        const end = `${compactDate(date)}T${meeting.endTime!.replace(":", "")}00`;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${escapeIcs(`${item.id}-${meeting.eventId || meetingIndex}-${date}`)}@ucsd-course-planner`,
          `DTSTAMP:${created}`,
          `DTSTART;TZID=America/Los_Angeles:${start}`,
          `DTEND;TZID=America/Los_Angeles:${end}`,
          `SUMMARY:${escapeIcs(`${item.course.courseAbbr} ${meeting.type}`)}`,
          `LOCATION:${escapeIcs(meeting.location || "TBA")}`,
          `DESCRIPTION:${escapeIcs(
            `${item.course.courseTitle}\n${item.section.label}\n${meeting.instructorName || "Instructor TBA"}`,
          )}`,
          "END:VEVENT",
        );
      });
    });
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
