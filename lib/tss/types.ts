export const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export type DayCode = (typeof DAY_CODES)[number];

export interface Course {
  academicYear: number;
  academicPeriod: number;
  academicYearText: string;
  academicPeriodText: string;
  moduleId: string;
  academicLevel: string;
  departmentAbbr: string;
  departmentText: string;
  courseAbbr: string;
  courseTitle: string;
  credits: string | number;
  incrementDisplay: string;
  description: string | null;
}

export interface Meeting {
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
}

export interface FinalExam {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  rawSchedule: string;
}

export interface SectionGroup {
  id: string;
  label: string;
  courseAbbr: string;
  /** TSS Event Package object id used in Fiori enroll deep-links. */
  eventPkgObjid: string;
  meetings: Meeting[];
  finalExam: FinalExam | null;
  seatsAvailable: number;
  capacity: number;
  enrolled: number;
  waitlistCount: number;
}

export interface ErrorDetail {
  code: string;
  message: string;
  /** Present only in development when an upstream failure is diagnosed. */
  detail?: string;
}

export interface ErrorResponse {
  error: ErrorDetail;
}

export interface SessionStatusResponse {
  connected: boolean;
}

export interface CourseSearchResponse {
  courses: Course[];
}

export interface SectionsResponse {
  sections: SectionGroup[];
}
