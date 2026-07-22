"use client";

import { useEffect, useState } from "react";
import type { Course, PlannedPackage, SectionGroup } from "@/lib/planner";
import { Icon } from "./Icons";

type CourseSearchProps = {
  planned: PlannedPackage[];
  onAdd: (course: Course, section: SectionGroup) => void;
  onRemove: (id: string) => void;
  onSessionExpired: () => void;
};

type ApiError = { error?: { code?: string; message?: string } };

const DAYS: Record<string, string> = {
  MO: "M",
  TU: "Tu",
  WE: "W",
  TH: "Th",
  FR: "F",
  SA: "Sa",
  SU: "Su",
};

function creditsLabel(credits: Course["credits"]): string {
  const parsed = Number.parseFloat(String(credits));
  return `${Number.isFinite(parsed) ? parsed : credits} units`;
}

function meetingWhen(section: SectionGroup["meetings"][number]): string {
  if (!section.startTime || !section.endTime) return section.rawSchedule || "Time TBA";
  const days = section.days.map((day) => DAYS[day]).join(" ");
  return `${days || "Date TBA"} · ${section.startTime}–${section.endTime}`;
}

async function readApiError(response: Response): Promise<ApiError> {
  try {
    return (await response.json()) as ApiError;
  } catch {
    return {};
  }
}

export function CourseSearch({
  planned,
  onAdd,
  onRemove,
  onSessionExpired,
}: CourseSearchProps) {
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sectionsByCourse, setSectionsByCourse] = useState<
    Record<string, SectionGroup[]>
  >({});
  const [sectionLoading, setSectionLoading] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setCourses([]);
      setSearched(false);
      setSearching(false);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch(
          `/api/courses/search?q=${encodeURIComponent(trimmed)}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) {
          const body = await readApiError(response);
          if (body.error?.code === "SESSION_EXPIRED") {
            onSessionExpired();
            return;
          }
          throw new Error(body.error?.message || "Course search failed.");
        }
        const body = (await response.json()) as { courses?: Course[] };
        setCourses(Array.isArray(body.courses) ? body.courses : []);
        setSearched(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCourses([]);
        setSearched(true);
        setSearchError(
          error instanceof Error
            ? error.message
            : "Could not search courses. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, onSessionExpired]);

  async function toggleCourse(course: Course) {
    if (expandedId === course.moduleId && !sectionErrors[course.moduleId]) {
      setExpandedId(null);
      return;
    }
    setExpandedId(course.moduleId);
    if (sectionsByCourse[course.moduleId] && !sectionErrors[course.moduleId]) return;

    setSectionLoading(course.moduleId);
    setSectionErrors((current) => ({ ...current, [course.moduleId]: "" }));
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(course.moduleId)}/sections?year=2026&period=2`,
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        const body = await readApiError(response);
        if (body.error?.code === "SESSION_EXPIRED") {
          onSessionExpired();
          return;
        }
        throw new Error(body.error?.message || "Sections could not be loaded.");
      }
      const body = (await response.json()) as { sections?: SectionGroup[] };
      setSectionsByCourse((current) => ({
        ...current,
        [course.moduleId]: Array.isArray(body.sections) ? body.sections : [],
      }));
    } catch (error) {
      setSectionErrors((current) => ({
        ...current,
        [course.moduleId]:
          error instanceof Error ? error.message : "Sections could not be loaded.",
      }));
    } finally {
      setSectionLoading((current) => (current === course.moduleId ? null : current));
    }
  }

  return (
    <aside className="search-pane" aria-label="Find courses">
      <div className="pane-heading">
        <div>
          <span className="step-kicker">Build your plan</span>
          <h2>Find courses</h2>
        </div>
        <span className="term-dot" title="Fall 2026" />
      </div>

      <label className="search-label" htmlFor="course-search">
        Search the Fall 2026 catalog
      </label>
      <div className="search-box">
        <Icon name="search" size={19} />
        <input
          id="course-search"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Course code or title"
          type="search"
          value={query}
        />
        {searching ? <span className="input-spinner" aria-label="Searching" /> : null}
        {query ? (
          <button
            aria-label="Clear search"
            className="search-clear"
            onClick={() => setQuery("")}
            type="button"
          >
            <Icon name="x" size={15} />
          </button>
        ) : null}
      </div>
      <p className="search-hint">Try “CSE 100”, “data science”, or “MATH”.</p>

      <div className="search-results" aria-live="polite">
        {searching && courses.length === 0 ? <SearchSkeleton /> : null}

        {searchError ? (
          <div className="inline-state error-state" role="alert">
            <Icon name="alert" />
            <div>
              <strong>Search unavailable</strong>
              <p>{searchError}</p>
            </div>
          </div>
        ) : null}

        {!searching && searched && !searchError && courses.length === 0 ? (
          <div className="inline-state">
            <div className="empty-icon">
              <Icon name="search" />
            </div>
            <strong>No matching courses</strong>
            <p>Check the course code or try a broader keyword.</p>
          </div>
        ) : null}

        {!searched && query.trim().length < 2 ? (
          <div className="search-welcome">
            <div className="catalog-mark">
              <span>C</span>
              <span>SE</span>
              <span>DSC</span>
            </div>
            <strong>Start with a course</strong>
            <p>
              Enter at least two characters to search live TSS catalog results.
            </p>
          </div>
        ) : null}

        {courses.map((course) => {
          const expanded = expandedId === course.moduleId;
          const sections = sectionsByCourse[course.moduleId];
          return (
            <article className={`course-result ${expanded ? "is-expanded" : ""}`} key={course.moduleId}>
              <button
                aria-expanded={expanded}
                className="course-result-button"
                onClick={() => toggleCourse(course)}
                type="button"
              >
                <div className="course-code-block">{course.courseAbbr}</div>
                <div className="course-result-copy">
                  <strong>{course.courseTitle}</strong>
                  <span>
                    {course.departmentAbbr} · {creditsLabel(course.credits)}
                  </span>
                </div>
                <Icon className="result-chevron" name="chevron" size={17} />
              </button>

              {expanded ? (
                <div className="section-list">
                  <div className="section-list-heading">
                    <span>Section packages</span>
                    {sections ? <small>{sections.length} available</small> : null}
                  </div>
                  {sectionLoading === course.moduleId ? <SectionSkeleton /> : null}
                  {sectionErrors[course.moduleId] ? (
                    <div className="section-error" role="alert">
                      <Icon name="alert" size={15} />
                      <span>{sectionErrors[course.moduleId]}</span>
                      <button onClick={() => toggleCourse(course)} type="button">
                        Retry
                      </button>
                    </div>
                  ) : null}
                  {sections?.length === 0 ? (
                    <p className="no-sections">No section packages are currently listed.</p>
                  ) : null}
                  {sections?.map((section) => {
                    const packageId = `${course.moduleId}:${section.id}`;
                    const isPlanned = planned.some((item) => item.id === packageId);
                    return (
                      <section className="section-card" key={section.id}>
                        <div className="section-card-top">
                          <div>
                            <strong>{section.label}</strong>
                            <span className="section-capacity">
                              <Icon name="users" size={14} />
                              {section.seatsAvailable > 0
                                ? `${section.seatsAvailable} of ${section.capacity} seats`
                                : "Full"}
                            </span>
                          </div>
                          <span
                            className={`seat-pill ${section.seatsAvailable > 0 ? "open" : "full"}`}
                          >
                            {section.seatsAvailable > 0
                              ? `${section.seatsAvailable} open`
                              : `${section.waitlistCount} waitlist`}
                          </span>
                        </div>
                        <div className="meeting-list">
                          {section.meetings.length === 0 ? (
                            <p className="meeting-tba">Meeting details TBA</p>
                          ) : (
                            section.meetings.map((meeting, index) => (
                              <div className="meeting-row" key={`${meeting.eventId}-${index}`}>
                                <span className="meeting-type">{meeting.type || "Class"}</span>
                                <div>
                                  <strong>{meetingWhen(meeting)}</strong>
                                  <span>
                                    {meeting.location || "Location TBA"} ·{" "}
                                    {meeting.instructorName || "Instructor TBA"}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                          {section.finalExam ? (
                            <div className="meeting-row final-row">
                              <span className="meeting-type">Final</span>
                              <div>
                                <strong>
                                  {section.finalExam.date || "Date TBA"}
                                  {section.finalExam.startTime && section.finalExam.endTime
                                    ? ` · ${section.finalExam.startTime}–${section.finalExam.endTime}`
                                    : ""}
                                </strong>
                                <span>
                                  {section.finalExam.location ||
                                    section.finalExam.rawSchedule ||
                                    "Location TBA"}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <button
                          className={isPlanned ? "remove-plan-button" : "add-plan-button"}
                          onClick={() =>
                            isPlanned ? onRemove(packageId) : onAdd(course, section)
                          }
                          type="button"
                        >
                          <Icon name={isPlanned ? "check" : "plus"} size={16} />
                          {isPlanned ? "Added — remove" : "Add package to plan"}
                        </button>
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function SearchSkeleton() {
  return (
    <div className="skeleton-stack" aria-label="Loading courses" role="status">
      {[0, 1, 2].map((item) => (
        <div className="course-skeleton" key={item}>
          <span className="skeleton skeleton-square" />
          <div>
            <span className="skeleton skeleton-line wide" />
            <span className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="section-card section-skeleton" aria-label="Loading sections" role="status">
      <span className="skeleton skeleton-line medium" />
      <span className="skeleton skeleton-line wide" />
      <span className="skeleton skeleton-line wide" />
      <span className="skeleton skeleton-button" />
    </div>
  );
}
