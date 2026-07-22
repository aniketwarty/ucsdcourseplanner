"use client";

import {
  detectConflicts,
  generateIcs,
  groupPlannedByCourse,
  totalCredits,
  type PlannedPackage,
} from "@/lib/planner";
import { Icon } from "./Icons";

type PlanSummaryProps = {
  planned: PlannedPackage[];
  onClear: () => void;
  onRemove: (id: string) => void;
};

export function PlanSummary({ planned, onClear, onRemove }: PlanSummaryProps) {
  const groups = groupPlannedByCourse(planned);
  const conflicts = detectConflicts(planned);
  const credits = totalCredits(planned);

  function exportCalendar() {
    const contents = generateIcs(planned);
    const url = URL.createObjectURL(
      new Blob([contents], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "fall-2026-course-plan.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="plan-summary" aria-labelledby="plan-summary-title">
      <div className="summary-heading">
        <div>
          <span className="step-kicker">Your plan</span>
          <h2 id="plan-summary-title">
            {groups.length} {groups.length === 1 ? "course" : "courses"}
          </h2>
        </div>
        {planned.length > 0 ? (
          <button
            aria-label="Clear all planned courses"
            className="text-button danger"
            onClick={onClear}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="credit-summary">
        <div>
          <strong>{Number.isInteger(credits) ? credits : credits.toFixed(1)}</strong>
          <span>Total units</span>
        </div>
        <div>
          <strong>{planned.length}</strong>
          <span>Packages</span>
        </div>
      </div>

      {conflicts.size > 0 ? (
        <div className="conflict-notice" role="status">
          <Icon name="alert" size={18} />
          <div>
            <strong>Schedule overlap</strong>
            <p>{conflicts.size} packages contain conflicting meeting times.</p>
          </div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="summary-empty">
          <div className="summary-empty-icon">
            <Icon name="calendar" />
          </div>
          <strong>No courses yet</strong>
          <p>Packages you add will stay saved on this device.</p>
        </div>
      ) : (
        <div className="planned-course-list">
          {groups.map((group) => (
            <section className="planned-course-group" key={group.course.moduleId}>
              <div className="planned-course-heading">
                <div className="planned-course-mark">
                  {group.course.departmentAbbr.slice(0, 3)}
                </div>
                <div>
                  <strong>{group.course.courseAbbr}</strong>
                  <span>{group.course.courseTitle}</span>
                </div>
              </div>
              {group.packages.map((item) => (
                <div
                  className={`planned-package ${conflicts.has(item.id) ? "has-conflict" : ""}`}
                  key={item.id}
                >
                  <div>
                    <span>{item.section.label}</span>
                    <small>
                      {item.section.meetings.length}{" "}
                      {item.section.meetings.length === 1 ? "meeting" : "meetings"}
                    </small>
                  </div>
                  {conflicts.has(item.id) ? (
                    <Icon
                      aria-label="Conflicting package"
                      className="package-conflict-icon"
                      name="alert"
                      size={15}
                    />
                  ) : null}
                  <button
                    aria-label={`Remove ${group.course.courseAbbr} ${item.section.label}`}
                    className="remove-package"
                    onClick={() => onRemove(item.id)}
                    type="button"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <div className="summary-actions">
        <button
          className="secondary-button"
          disabled={planned.length === 0}
          onClick={exportCalendar}
          type="button"
        >
          <Icon name="download" size={16} />
          Export .ics
        </button>
        <a
          className="primary-button"
          href="https://tss.ucsd.edu/fiori"
          rel="noreferrer"
          target="_blank"
        >
          Enroll on TSS
          <Icon name="external" size={15} />
        </a>
      </div>
      <p className="handoff-copy">
        Your plan is not an enrollment. TSS opens in a new tab so you can
        verify availability and enroll there.
      </p>
    </aside>
  );
}
