"use client";

import { useEffect, useRef, useState } from "react";
import {
  findSectionConflicts,
  sectionInstructor,
  sectionTimeSummary,
  type Course,
  type PlannedPackage,
  type SectionGroup,
} from "@/lib/planner";
import type { AcademicTerm } from "@/lib/tss/terms";
import { Icon } from "./Icons";

type CourseSearchProps = {
  term: AcademicTerm;
  planned: PlannedPackage[];
  onAdd: (course: Course, section: SectionGroup) => void;
  onRemove: (id: string) => void;
  onSessionExpired: () => void;
};

type ApiError = { error?: { code?: string; message?: string } };

const DAY_LABEL: Record<string, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

async function readApiError(response: Response): Promise<ApiError> {
  try {
    return (await response.json()) as ApiError;
  } catch {
    return {};
  }
}

function meetingWhen(section: SectionGroup["meetings"][number]): string {
  if (!section.startTime || !section.endTime) return section.rawSchedule || "Time TBA";
  const days = section.days.map((day) => DAY_LABEL[day]).join(" / ");
  return `${days || "Date TBA"} · ${section.startTime}–${section.endTime}`;
}

function seatLabel(section: SectionGroup): string {
  return `${Math.max(section.seatsAvailable, 0)} / ${section.capacity}`;
}

export function CourseSearch({
  term,
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
  const [hideConflicts, setHideConflicts] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [sectionsByCourse, setSectionsByCourse] = useState<
    Record<string, SectionGroup[]>
  >({});
  const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({});
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const loadedModules = useRef(new Set<string>());

  useEffect(() => {
    loadedModules.current.clear();
    setCourses([]);
    setSectionsByCourse({});
    setSectionLoading({});
    setSectionErrors({});
    setExpandedKey(null);
    setSearched(false);
    setSearchError("");
  }, [term.id]);

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
        const params = new URLSearchParams({
          q: trimmed,
          year: String(term.academicYear),
          period: String(term.academicPeriod),
        });
        const response = await fetch(`/api/courses/search?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
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
        setExpandedKey(null);
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
  }, [query, term.academicYear, term.academicPeriod, onSessionExpired]);

  useEffect(() => {
    if (courses.length === 0) return;
    const controller = new AbortController();
    const missing = courses.filter(
      (course) => !loadedModules.current.has(course.moduleId),
    );
    if (missing.length === 0) return;

    missing.forEach((course) => {
      loadedModules.current.add(course.moduleId);
      setSectionLoading((current) => ({ ...current, [course.moduleId]: true }));
    });

    void Promise.all(
      missing.map(async (course) => {
        try {
          const params = new URLSearchParams({
            year: String(term.academicYear),
            period: String(term.academicPeriod),
          });
          const response = await fetch(
            `/api/courses/${encodeURIComponent(course.moduleId)}/sections?${params}`,
            { credentials: "same-origin", signal: controller.signal },
          );
          if (!response.ok) {
            const body = await readApiError(response);
            if (body.error?.code === "SESSION_EXPIRED") {
              loadedModules.current.delete(course.moduleId);
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
          setSectionErrors((current) => ({ ...current, [course.moduleId]: "" }));
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            loadedModules.current.delete(course.moduleId);
            return;
          }
          loadedModules.current.delete(course.moduleId);
          setSectionErrors((current) => ({
            ...current,
            [course.moduleId]:
              error instanceof Error ? error.message : "Sections could not be loaded.",
          }));
        } finally {
          if (!controller.signal.aborted) {
            setSectionLoading((current) => ({
              ...current,
              [course.moduleId]: false,
            }));
          }
        }
      }),
    );

    return () => controller.abort();
  }, [courses, term.academicYear, term.academicPeriod, onSessionExpired]);

  function retrySections(course: Course) {
    loadedModules.current.delete(course.moduleId);
    setSectionErrors((current) => ({ ...current, [course.moduleId]: "" }));
    setSectionsByCourse((current) => {
      const next = { ...current };
      delete next[course.moduleId];
      return next;
    });
    setCourses((current) => [...current]);
  }

  return (
    <aside className="search-pane" aria-label="Find courses">
      <div className="search-pane-top">
        <div className="search-box">
          <Icon name="search" size={18} />
          <input
            id="course-search"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${term.shortLabel} classes…`}
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

        <label className="search-filter-toggle">
          <input
            checked={hideConflicts}
            onChange={(event) => setHideConflicts(event.target.checked)}
            type="checkbox"
          />
          <span>Hide conflicting sections</span>
        </label>
      </div>

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
              Enter at least two characters to search live TSS catalog results for{" "}
              {term.shortLabel}.
            </p>
          </div>
        ) : null}

        {courses.map((course) => {
          const sections = sectionsByCourse[course.moduleId];
          const loading = sectionLoading[course.moduleId];
          const error = sectionErrors[course.moduleId];
          const visibleSections = sections
            ? hideConflicts
              ? sections.filter((section) => {
                  const packageId = `${course.moduleId}:${section.id}`;
                  return (
                    findSectionConflicts(section, planned, packageId).length === 0
                  );
                })
              : sections
            : undefined;
          const hiddenCount =
            sections && visibleSections
              ? sections.length - visibleSections.length
              : 0;

          return (
            <article className="course-block" key={course.moduleId}>
              <div className="course-block-heading">
                <div className="course-block-code">{course.courseAbbr}</div>
                <div className="course-block-title">{course.courseTitle}</div>
                <div className="course-block-meta">
                  {visibleSections
                    ? `${visibleSections.length} section${visibleSections.length === 1 ? "" : "s"}`
                    : loading
                      ? "Loading…"
                      : "Sections"}
                  {hiddenCount > 0 ? (
                    <span className="course-block-filter-note">
                      · {hiddenCount} hidden
                    </span>
                  ) : null}
                </div>
              </div>

              {error ? (
                <div className="section-error" role="alert">
                  <Icon name="alert" size={15} />
                  <span>{error}</span>
                  <button onClick={() => retrySections(course)} type="button">
                    Retry
                  </button>
                </div>
              ) : null}

              {loading && !sections ? <SectionSkeleton /> : null}

              {visibleSections?.length === 0 ? (
                <p className="no-sections">
                  {hiddenCount > 0
                    ? "All listed sections conflict with your plan."
                    : "No classes are currently listed."}
                </p>
              ) : null}

              {visibleSections && visibleSections.length > 0 ? (
                <div className="section-table">
                  <div className="section-table-head" aria-hidden="true">
                    <div className="section-row-main">
                      <div className="section-row-button is-header">
                        <span className="section-expand-icon" />
                        <span>Instructor</span>
                        <span className="section-times-label">Meeting times</span>
                        <span className="seat-chip-label">Seats</span>
                      </div>
                      <span className="section-quick-add-spacer" />
                    </div>
                  </div>
                  {visibleSections.map((section) => {
                    const packageId = `${course.moduleId}:${section.id}`;
                    const isPlanned = planned.some((item) => item.id === packageId);
                    const conflicts = findSectionConflicts(
                      section,
                      planned,
                      packageId,
                    );
                    const conflict = conflicts[0];
                    const open = section.seatsAvailable > 0;
                    const key = `${course.moduleId}|${section.id}`;
                    const expanded = expandedKey === key;
                    const fitTone = conflict ? "conflict" : open ? "fit" : "full";
                    const fitLabel = conflict
                      ? `Overlaps ${conflict.course.courseAbbr}`
                      : open
                        ? "Fits your schedule"
                        : "Section full";
                    const addLabel = isPlanned
                      ? `Remove ${course.courseAbbr} ${section.label}`
                      : conflict
                        ? `Add ${section.label} despite conflict`
                        : open
                          ? `Add ${section.label} to plan`
                          : `Add waitlisted ${section.label} to plan`;
                    return (
                      <div
                        className={`section-row ${expanded ? "is-expanded" : ""}`}
                        key={section.id}
                      >
                        <div className="section-row-main">
                          <button
                            aria-expanded={expanded}
                            className="section-row-button"
                            onClick={() =>
                              setExpandedKey((current) =>
                                current === key ? null : key,
                              )
                            }
                            type="button"
                          >
                            <span className="section-expand-icon" aria-hidden="true">
                              {expanded ? "▾" : "▸"}
                            </span>
                            <span className="section-prof">
                              <strong>{sectionInstructor(section)}</strong>
                              <small>
                                {section.label}
                                <span className={`fit-inline ${fitTone}`}>
                                  · {fitLabel}
                                </span>
                              </small>
                            </span>
                            <span className="section-times">
                              {sectionTimeSummary(section)}
                            </span>
                            <span className={`seat-chip ${open ? "open" : "full"}`}>
                              {seatLabel(section)}
                            </span>
                          </button>
                          <button
                            aria-label={addLabel}
                            className={
                              isPlanned
                                ? "section-quick-add is-added"
                                : conflict
                                  ? "section-quick-add is-conflict"
                                  : open
                                    ? "section-quick-add"
                                    : "section-quick-add is-waitlist"
                            }
                            onClick={() =>
                              isPlanned
                                ? onRemove(packageId)
                                : onAdd(course, section)
                            }
                            title={addLabel}
                            type="button"
                          >
                            <Icon name={isPlanned ? "check" : "plus"} size={16} />
                          </button>
                        </div>

                        {expanded ? (
                          <div className="section-detail">
                            {section.meetings.length === 0 && !section.finalExam ? (
                              <p className="meeting-tba">Meeting details TBA</p>
                            ) : (
                              <div className="meeting-detail-table">
                                <div className="meeting-detail-head" aria-hidden="true">
                                  <span>Type</span>
                                  <span>Schedule</span>
                                  <span>Location</span>
                                </div>
                                <ul className="meeting-list-clean">
                                  {section.meetings.map((meeting, index) => (
                                    <li key={`${meeting.eventId}-${index}`}>
                                      <span className="meeting-kind">
                                        {meeting.type || "Class"}
                                      </span>
                                      <span className="meeting-when">
                                        {meetingWhen(meeting)}
                                      </span>
                                      <span className="meeting-loc">
                                        {meeting.location || "Location TBA"}
                                      </span>
                                    </li>
                                  ))}
                                  {section.finalExam ? (
                                    <li>
                                      <span className="meeting-kind">Final</span>
                                      <span className="meeting-when">
                                        {section.finalExam.date || "Date TBA"}
                                        {section.finalExam.startTime &&
                                        section.finalExam.endTime
                                          ? ` · ${section.finalExam.startTime}–${section.finalExam.endTime}`
                                          : ""}
                                      </span>
                                      <span className="meeting-loc">
                                        {section.finalExam.location ||
                                          section.finalExam.rawSchedule ||
                                          "Location TBA"}
                                      </span>
                                    </li>
                                  ) : null}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
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
    <div className="section-skeleton" aria-label="Loading sections" role="status">
      <span className="skeleton skeleton-line medium" />
      <span className="skeleton skeleton-line wide" />
      <span className="skeleton skeleton-line wide" />
      <span className="skeleton skeleton-button" />
    </div>
  );
}
