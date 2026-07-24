"use client";

import {
  courseColor,
  detectConflicts,
  formatFinalLabel,
  generateIcs,
  sectionInstructor,
  sectionLocation,
  sectionTimeSummary,
  totalCredits,
  type PlannedPackage,
} from "@/lib/planner";
import { buildPlannedPackageEnrollUrl } from "@/lib/tss/enroll";
import type { AcademicTerm } from "@/lib/tss/terms";
import { Icon } from "./Icons";
import { ProjectLinks } from "./ProjectLinks";
import { ScheduleCalendar } from "./ScheduleCalendar";

export type PlanView = "list" | "calendar" | "finals";

type PlanPaneProps = {
  term: AcademicTerm;
  planned: PlannedPackage[];
  view: PlanView;
  onViewChange: (view: PlanView) => void;
  onClear: () => void;
  onRemove: (id: string) => void;
};

function slugifyTerm(label: string): string {
  return label
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
}

export function PlanPane({
  term,
  planned,
  view,
  onViewChange,
  onClear,
  onRemove,
}: PlanPaneProps) {
  const conflictScope =
    view === "finals" ? "finals" : view === "calendar" ? "classes" : "all";
  const conflicts = detectConflicts(planned, conflictScope);
  const credits = totalCredits(planned);
  const empty = planned.length === 0;

  function exportCalendar() {
    const contents = generateIcs(planned, `${term.shortLabel} Course Plan`);
    const url = URL.createObjectURL(
      new Blob([contents], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugifyTerm(term.shortLabel)}-course-plan.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="plan-pane" aria-label={`${term.shortLabel} plan`}>
      <div className="plan-pane-header">
        <span className="plan-pane-label">Your plan</span>
        <div className="plan-stats" aria-label="Plan summary">
          <div>
            <strong>{Number.isInteger(credits) ? credits : credits.toFixed(1)}</strong>
            <span>units</span>
          </div>
          <div>
            <strong>{planned.length}</strong>
            <span>{planned.length === 1 ? "class" : "classes"}</span>
          </div>
          {conflicts.size > 0 ? (
            <div className="plan-conflict-badge" role="status">
              <Icon name="alert" size={14} />
              {conflicts.size} conflict{conflicts.size === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
        <div className="view-toggle" role="tablist" aria-label="Plan view">
          {(
            [
              ["list", "List"],
              ["calendar", "Calendar"],
              ["finals", "Finals"],
            ] as const
          ).map(([id, label]) => (
            <button
              aria-selected={view === id}
              className={view === id ? "is-active" : ""}
              key={id}
              onClick={() => onViewChange(id)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="plan-pane-body">
        {view === "list" ? (
          empty ? (
            <div className="plan-empty">
              <div className="plan-empty-title">No courses in your plan yet</div>
              <p>
                Add sections from the search on the left to start building your{" "}
                {term.shortLabel} schedule.
              </p>
            </div>
          ) : (
            <div className="plan-list">
              <div className="plan-list-head" aria-hidden="true">
                <span>Course</span>
                <span>Section</span>
                <span>Instructor</span>
                <span>Meets</span>
                <span>Location</span>
                <span>Final</span>
                <span>Enroll</span>
                <span />
              </div>
              {planned.map((item) => {
                const color = courseColor(item.course.moduleId);
                const hasConflict = conflicts.has(item.id);
                const enrollUrl = buildPlannedPackageEnrollUrl(item);
                return (
                  <div
                    className={`plan-list-row ${hasConflict ? "has-conflict" : ""}`}
                    key={item.id}
                  >
                    <div className="plan-list-course">
                      <span
                        className="course-dot"
                        style={{
                          background: hasConflict ? "#B42318" : color.border,
                        }}
                      />
                      <div>
                        <strong>{item.course.courseAbbr}</strong>
                        <span>{item.course.courseTitle}</span>
                      </div>
                    </div>
                    <div className="plan-list-sec">{item.section.label}</div>
                    <div>{sectionInstructor(item.section)}</div>
                    <div className="tabular">{sectionTimeSummary(item.section)}</div>
                    <div>{sectionLocation(item.section)}</div>
                    <div className="tabular">{formatFinalLabel(item.section)}</div>
                    {enrollUrl ? (
                      <a
                        aria-label={`Enroll in ${item.course.courseAbbr} ${item.section.label} on TSS`}
                        className="plan-list-enroll"
                        href={enrollUrl}
                        rel="noreferrer"
                        target="_blank"
                        title="Open enrollment on TSS"
                      >
                        Enroll
                        <Icon name="external" size={12} />
                      </a>
                    ) : (
                      <span className="plan-list-enroll is-disabled">Enroll</span>
                    )}
                    <button
                      aria-label={`Remove ${item.course.courseAbbr} ${item.section.label}`}
                      className="plan-list-remove"
                      onClick={() => onRemove(item.id)}
                      title="Remove from plan"
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {view === "calendar" ? (
          <ScheduleCalendar
            mode="classes"
            onRemove={onRemove}
            planned={planned}
            term={term}
          />
        ) : null}

        {view === "finals" ? (
          <ScheduleCalendar
            mode="finals"
            onRemove={onRemove}
            planned={planned}
            term={term}
          />
        ) : null}
      </div>

      <div className="plan-pane-footer">
        <div className="plan-footer-actions">
          {planned.length > 0 ? (
            <button className="text-button danger" onClick={onClear} type="button">
              Clear
            </button>
          ) : null}
          <button
            className="secondary-button"
            disabled={planned.length === 0}
            onClick={exportCalendar}
            type="button"
          >
            <Icon name="download" size={15} />
            Export .ics
          </button>
          <ProjectLinks />
        </div>
      </div>
    </section>
  );
}
