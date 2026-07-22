import type {
  DayCode,
  FinalExam,
  Meeting,
  SectionGroup,
} from "./types";

type TssRecord = Record<string, unknown>;

const DAY_NAMES: Array<[RegExp, DayCode]> = [
  [/\b(?:MO|MON|MONDAY)\b/i, "MO"],
  [/\b(?:TU|TUE|TUESDAY)\b/i, "TU"],
  [/\b(?:WE|WED|WEDNESDAY)\b/i, "WE"],
  [/\b(?:TH|THU|THURSDAY)\b/i, "TH"],
  [/\b(?:FR|FRI|FRIDAY)\b/i, "FR"],
  [/\b(?:SA|SAT|SATURDAY)\b/i, "SA"],
  [/\b(?:SU|SUN|SUNDAY)\b/i, "SU"],
];

const TIME_RANGE =
  /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\b/i;
const DATE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?)\b/i;

export function mapSectionGroups(data: unknown): SectionGroup[] {
  const records = extractRecords(data);
  const groups = new Map<string, SectionGroup>();
  const seenMeetings = new Map<string, Set<string>>();

  for (const record of records) {
    const id =
      text(record, "EventPkgText") ||
      text(record, "EventAbbr") ||
      text(record, "EventID");
    if (!id) continue;

    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        label:
          text(record, "EventPkgText", "EventAbbr", "EventID") || id,
        courseAbbr:
          text(record, "CourseAbbr", "ModuleAbbr", "ModuleCode") ||
          courseAbbrFromPackage(id),
        meetings: [],
        finalExam: null,
        seatsAvailable: numeric(
          record,
          "EventPkgSeatsAvailable",
          "SeatsAvailable",
          "AvailableSeats",
          "AvailSeats",
          "FreeSeats",
        ) ?? 0,
        capacity: numeric(
          record,
          "EventPkgLimit",
          "Limit",
          "Capacity",
          "MaxSeats",
          "TotalSeats",
        ) ?? 0,
        enrolled:
          numeric(record, "Enrolled", "BookedSeats", "Bookings") ?? 0,
        waitlistCount: numeric(
          record,
          "EventPkgNumOnWaitl",
          "Waitlist",
          "WaitlistCount",
          "Waitlisted",
        ) ?? 0,
      };
      groups.set(id, group);
      seenMeetings.set(id, new Set());
    } else {
      group.seatsAvailable = mergeNumber(
        group.seatsAvailable,
        numeric(
          record,
          "EventPkgSeatsAvailable",
          "SeatsAvailable",
          "AvailableSeats",
          "AvailSeats",
          "FreeSeats",
        ),
      ) ?? 0;
      group.capacity = mergeNumber(
        group.capacity,
        numeric(
          record,
          "EventPkgLimit",
          "Limit",
          "Capacity",
          "MaxSeats",
          "TotalSeats",
        ),
      ) ?? 0;
      group.enrolled = mergeNumber(
        group.enrolled,
        numeric(record, "Enrolled", "BookedSeats", "Bookings"),
      ) ?? 0;
      group.waitlistCount = mergeNumber(
        group.waitlistCount,
        numeric(
          record,
          "EventPkgNumOnWaitl",
          "Waitlist",
          "WaitlistCount",
          "Waitlisted",
        ),
      ) ?? 0;
    }

    const schedule = text(record, "Sched", "Schedule");
    const location = nullableText(
      record,
      "LocationText",
      "Location",
      "RoomText",
      "Room",
      "BuildingRoom",
    );
    const instructor = text(
      record,
      "InstructorName",
      "Instructor",
      "FacultyName",
    );
    const instructorEmail = normalizeEmail(
      text(record, "InstructorEmail", "FacultyEmail", "Email"),
    );
    const eventId = text(record, "EventID", "EventId");
    const eventType = text(
      record,
      "TeachingMethod_Text",
      "TeachingMethod",
      "EventTypeText",
      "EventType",
      "EventAbbr",
    );
    const status = text(record, "StatusText", "Status", "EventStatus");
    const beginDate = normalizeDate(
      record,
      "BeginDate",
      "EventBegDate",
      "EventBeginDate",
      "StartDate",
    );
    const endDate = normalizeDate(
      record,
      "EndDate",
      "EventEndDate",
      "FinishDate",
    );

    for (const line of scheduleLines(schedule)) {
      if (/final\s+examination|\bfinal\s+exam\b/i.test(line)) {
        group.finalExam ??= parseFinalExam(line, location);
        continue;
      }
      const meeting = parseMeeting(line, {
        eventId,
        type: eventType,
        instructorName: instructor,
        instructorEmail,
        location: location ?? "",
        status,
        beginDate,
        endDate,
      });
      const key = JSON.stringify(meeting);
      const seen = seenMeetings.get(id)!;
      if (!seen.has(key)) {
        seen.add(key);
        group.meetings.push(meeting);
      }
    }
  }

  return [...groups.values()];
}

export function parseMeeting(
  raw: string,
  metadata: Partial<
    Pick<
      Meeting,
      | "eventId"
      | "type"
      | "instructorName"
      | "instructorEmail"
      | "location"
      | "status"
      | "beginDate"
      | "endDate"
    >
  > = {},
): Meeting {
  const range = raw.match(TIME_RANGE);
  return {
    eventId: metadata.eventId ?? "",
    type: metadata.type ?? "",
    instructorName: metadata.instructorName ?? "",
    instructorEmail: metadata.instructorEmail ?? "",
    location:
      inferLocation(raw, range?.[0]) ?? metadata.location ?? "",
    status: metadata.status ?? "",
    days: extractWeekdays(raw),
    startTime: range ? normalizeTime(range[1]) : null,
    endTime: range ? normalizeTime(range[2]) : null,
    beginDate: metadata.beginDate ?? "",
    endDate: metadata.endDate ?? "",
    rawSchedule: raw,
  };
}

export function parseFinalExam(
  raw: string,
  fallbackLocation: string | null = null,
): FinalExam {
  const range = raw.match(TIME_RANGE);
  const date = raw.match(DATE)?.[0] ?? null;
  return {
    date: date ? normalizeExamDate(date) : null,
    startTime: range ? normalizeTime(range[1]) : null,
    endTime: range ? normalizeTime(range[2]) : null,
    location: inferLocation(raw, range?.[0]) ?? fallbackLocation,
    rawSchedule: raw,
  };
}

function scheduleLines(schedule: string): string[] {
  if (!schedule.trim()) return [];
  return schedule
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n|\s*\|\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeTime(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return normalized;

  let hours = Number(match[1]);
  const minutes = match[2] ?? "00";
  if (match[3] === "AM" && hours === 12) hours = 0;
  if (match[3] === "PM" && hours !== 12) hours += 12;
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function extractWeekdays(raw: string): DayCode[] {
  const found = new Set<DayCode>();
  for (const [pattern, day] of DAY_NAMES) {
    if (pattern.test(raw)) found.add(day);
  }

  const compactDays: Record<string, DayCode> = {
    M: "MO",
    MO: "MO",
    T: "TU",
    TU: "TU",
    W: "WE",
    WE: "WE",
    R: "TH",
    TH: "TH",
    F: "FR",
    FR: "FR",
    SA: "SA",
    SU: "SU",
  };
  const tokens = raw.toUpperCase().match(/[A-Z]+/g) ?? [];
  for (const token of tokens) {
    if (compactDays[token]) {
      found.add(compactDays[token]);
      continue;
    }
    if (!/^(?:(?:TU|TH|SA|SU)|[MTWRF])+$/.test(token)) continue;
    for (const match of token.matchAll(/TU|TH|SA|SU|M|T|W|R|F/g)) {
      found.add(compactDays[match[0]]);
    }
  }

  const order: DayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  return order.filter((day) => found.has(day));
}

function inferLocation(
  raw: string,
  matchedTime: string | undefined,
): string | null {
  if (!matchedTime) return null;
  const after = raw.slice(raw.indexOf(matchedTime) + matchedTime.length);
  const cleaned = after
    .replace(/^[\s,;@-]+/, "")
    .replace(/\b(?:final\s+examination|final\s+exam)\b/gi, "")
    .trim();
  return cleaned || null;
}

function normalizeExamDate(value: string): string | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;

  const numericDate = value.match(
    /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/,
  );
  if (numericDate) {
    const yearValue = numericDate[3];
    if (!yearValue) return null;
    const year =
      yearValue.length === 2 ? `20${yearValue}` : yearValue;
    const month = numericDate[1].padStart(2, "0");
    const day = numericDate[2].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function normalizeEmail(value: string): string {
  return value.replace(/^mailto:\s*/i, "").trim();
}

function courseAbbrFromPackage(value: string): string {
  return value.match(/\b[A-Z]{2,8}-\d+[A-Z]*\b/i)?.[0]?.toUpperCase() ?? "";
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

function nullableText(
  record: TssRecord,
  ...fields: string[]
): string | null {
  return text(record, ...fields) || null;
}

function normalizeDate(record: TssRecord, ...fields: string[]): string {
  const value = text(record, ...fields);
  if (!value) return "";

  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  const sapTimestamp = value.match(/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/);
  if (sapTimestamp) {
    return new Date(Number(sapTimestamp[1])).toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? ""
    : parsed.toISOString().slice(0, 10);
}

function numeric(record: TssRecord, ...fields: string[]): number | null {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function mergeNumber(
  current: number | null,
  incoming: number | null,
): number | null {
  if (incoming === null) return current;
  if (current === null) return incoming;
  return Math.max(current, incoming);
}
