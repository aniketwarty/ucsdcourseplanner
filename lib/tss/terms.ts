/**
 * UCSD undergraduate academic periods as used by TSS.
 *
 * Term IDs follow YYYY-###-UN (e.g. Fall 2026 = 2026-002-UN, Summer Session 2
 * 2024 = 2023-007-UN). AcademicPeriod in OData is the unpadded number.
 * Academic years are summer-trailing: Fall Y → Winter Y+1 → Spring Y+1 → Summer Y+1.
 *
 * TSS became the system of record starting Fall 2026; earlier terms stay on ISIS.
 */
export type TermPeriodKind =
  | "fall"
  | "winter"
  | "spring"
  | "summer1"
  | "summer2";

export type AcademicTerm = {
  id: string;
  academicYear: number;
  academicPeriod: number;
  academicYearText: string;
  academicPeriodText: string;
  shortLabel: string;
  kind: TermPeriodKind;
  /** Inclusive start used for "current term" detection. */
  termStart: string;
  /** Inclusive end used for "current term" detection. */
  termEnd: string;
  /** First day of instruction (may be mid-week). */
  instructionStart: string;
  /**
   * Monday on or after instruction start — use this as the weekly calendar
   * anchor so Mon–Wed meetings aren’t clipped by a mid-week startRecur.
   */
  calendarStart: string;
  /** Schematic finals-week window for the finals calendar view. */
  finalsStart: string;
  finalsEnd: string;
};

type PeriodDefinition = {
  kind: TermPeriodKind;
  academicPeriod: number;
  academicPeriodText: string;
  shortName: string;
  /** Month/day offsets relative to the calendar year of the period. */
  calendarYearOffset: 0 | 1;
  termStartMd: [number, number];
  termEndMd: [number, number];
  instructionStartMd: [number, number];
  finalsStartMd: [number, number];
  finalsEndMd: [number, number];
};

/** First term available in TSS course search. */
export const TSS_FIRST_TERM_YEAR = 2026;
export const TSS_FIRST_TERM_PERIOD = 2;

/**
 * Period codes inferred from published TSS Term IDs (Fall=002, Summer Session 2=007)
 * and sequential undergrad ordering Fall → Winter → Spring → Summer.
 */
const PERIOD_DEFINITIONS: readonly PeriodDefinition[] = [
  {
    kind: "fall",
    academicPeriod: 2,
    academicPeriodText: "Fall Quarter",
    shortName: "Fall",
    calendarYearOffset: 0,
    termStartMd: [9, 15],
    termEndMd: [12, 15],
    instructionStartMd: [9, 24],
    finalsStartMd: [12, 5],
    finalsEndMd: [12, 12],
  },
  {
    kind: "winter",
    academicPeriod: 3,
    academicPeriodText: "Winter Quarter",
    shortName: "Winter",
    calendarYearOffset: 1,
    termStartMd: [1, 2],
    termEndMd: [3, 22],
    instructionStartMd: [1, 4],
    finalsStartMd: [3, 13],
    finalsEndMd: [3, 20],
  },
  {
    kind: "spring",
    academicPeriod: 4,
    academicPeriodText: "Spring Quarter",
    shortName: "Spring",
    calendarYearOffset: 1,
    termStartMd: [3, 23],
    termEndMd: [6, 15],
    instructionStartMd: [3, 29],
    finalsStartMd: [6, 5],
    finalsEndMd: [6, 11],
  },
  {
    kind: "summer1",
    academicPeriod: 5,
    academicPeriodText: "Summer Session 1",
    shortName: "Summer Session 1",
    calendarYearOffset: 1,
    termStartMd: [6, 16],
    termEndMd: [7, 31],
    instructionStartMd: [6, 28],
    finalsStartMd: [7, 30],
    finalsEndMd: [7, 31],
  },
  {
    kind: "summer2",
    academicPeriod: 7,
    academicPeriodText: "Summer Session 2",
    shortName: "Summer Session 2",
    calendarYearOffset: 1,
    termStartMd: [8, 1],
    termEndMd: [9, 14],
    instructionStartMd: [8, 2],
    finalsStartMd: [9, 3],
    finalsEndMd: [9, 4],
  },
] as const;

const PERIOD_BY_NUMBER = new Map(
  PERIOD_DEFINITIONS.map((period) => [period.academicPeriod, period]),
);

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** First Monday on or after an ISO date (UTC noon to avoid DST edge cases). */
export function mondayOnOrAfter(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = date.getUTCDay(); // 0 Sun … 6 Sat
  const delta = weekday === 1 ? 0 : weekday === 0 ? 1 : 8 - weekday;
  date.setUTCDate(date.getUTCDate() + delta);
  return isoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function termId(academicYear: number, academicPeriod: number): string {
  return `${academicYear}-${academicPeriod}`;
}

export function buildTerm(
  academicYear: number,
  academicPeriod: number,
): AcademicTerm | null {
  const definition = PERIOD_BY_NUMBER.get(academicPeriod);
  if (!definition) return null;

  const calendarYear = academicYear + definition.calendarYearOffset;
  const displayYear =
    definition.kind === "fall" ? academicYear : academicYear + 1;

  const instructionStart = isoDate(
    calendarYear,
    ...definition.instructionStartMd,
  );

  return {
    id: termId(academicYear, academicPeriod),
    academicYear,
    academicPeriod,
    academicYearText: `${academicYear}/${academicYear + 1}`,
    academicPeriodText: definition.academicPeriodText,
    shortLabel: `${definition.shortName} ${displayYear}`,
    kind: definition.kind,
    termStart: isoDate(calendarYear, ...definition.termStartMd),
    termEnd: isoDate(calendarYear, ...definition.termEndMd),
    instructionStart,
    calendarStart: mondayOnOrAfter(instructionStart),
    finalsStart: isoDate(calendarYear, ...definition.finalsStartMd),
    finalsEnd: isoDate(calendarYear, ...definition.finalsEndMd),
  };
}

export function listTermsForAcademicYear(academicYear: number): AcademicTerm[] {
  return PERIOD_DEFINITIONS.map((period) =>
    buildTerm(academicYear, period.academicPeriod),
  ).filter((term): term is AcademicTerm => term !== null);
}

/** Ordered terms from the TSS cutover through `yearsAhead` academic years. */
export function listAvailableTerms(yearsAhead = 3): AcademicTerm[] {
  const terms: AcademicTerm[] = [];
  for (let year = TSS_FIRST_TERM_YEAR; year <= TSS_FIRST_TERM_YEAR + yearsAhead; year += 1) {
    for (const term of listTermsForAcademicYear(year)) {
      if (
        year === TSS_FIRST_TERM_YEAR &&
        term.academicPeriod < TSS_FIRST_TERM_PERIOD
      ) {
        continue;
      }
      terms.push(term);
    }
  }
  return terms;
}

export function findTerm(
  academicYear: number,
  academicPeriod: number,
): AcademicTerm | null {
  return buildTerm(academicYear, academicPeriod);
}

export function parseTermParams(
  year: string | null,
  period: string | null,
): AcademicTerm | null {
  if (year === null || period === null) return null;
  const academicYear = Number(year);
  const academicPeriod = Number(period);
  if (!Number.isInteger(academicYear) || !Number.isInteger(academicPeriod)) {
    return null;
  }
  const term = findTerm(academicYear, academicPeriod);
  if (!term) return null;
  if (
    academicYear < TSS_FIRST_TERM_YEAR ||
    (academicYear === TSS_FIRST_TERM_YEAR &&
      academicPeriod < TSS_FIRST_TERM_PERIOD)
  ) {
    return null;
  }
  return term;
}

/**
 * The term underway on `now`, or the next upcoming TSS term when we are between
 * terms / before the TSS cutover.
 */
export function getCurrentTerm(now: Date = new Date()): AcademicTerm {
  const today = isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const terms = listAvailableTerms(4);

  for (const term of terms) {
    if (compareIso(term.termStart, today) <= 0 && compareIso(today, term.termEnd) <= 0) {
      return term;
    }
  }

  const upcoming = terms.find((term) => compareIso(term.termStart, today) > 0);
  if (upcoming) return upcoming;

  return terms[terms.length - 1] ?? buildTerm(TSS_FIRST_TERM_YEAR, TSS_FIRST_TERM_PERIOD)!;
}

export function isSameTerm(
  course: { academicYear: string | number; academicPeriod: string | number },
  term: Pick<AcademicTerm, "academicYear" | "academicPeriod">,
): boolean {
  return (
    Number(course.academicYear) === term.academicYear &&
    Number(course.academicPeriod) === term.academicPeriod
  );
}
