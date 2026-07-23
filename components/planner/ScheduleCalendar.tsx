"use client";

import type { EventContentArg } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { CalendarMode, PlannedPackage } from "@/lib/planner";
import { toCalendarEvents } from "@/lib/planner";
import type { AcademicTerm } from "@/lib/tss/terms";
import { Icon } from "./Icons";

type ScheduleCalendarProps = {
  term: AcademicTerm;
  planned: PlannedPackage[];
  mode: CalendarMode;
  onRemove?: (id: string) => void;
};

export function ScheduleCalendar({
  term,
  planned,
  mode,
  onRemove,
}: ScheduleCalendarProps) {
  const events = toCalendarEvents(planned, mode, {
    start: term.finalsStart,
    end: term.finalsEnd,
  });
  const isFinals = mode === "finals";

  return (
    <div className={`calendar-shell ${isFinals ? "is-finals" : ""}`}>
      <div
        className="calendar-scroll"
        aria-label={
          isFinals
            ? `${term.shortLabel} finals schedule`
            : `${term.shortLabel} weekly course schedule`
        }
      >
        <div className="calendar-min-width">
          <FullCalendar
            allDaySlot={false}
            dayHeaderFormat={{ weekday: "short" }}
            dayHeaderClassNames="planner-day-header"
            editable={false}
            eventContent={(info) => renderEvent(info, onRemove)}
            eventDidMount={(info) => {
              const props = info.event.extendedProps;
              const conflictText = props.conflict ? ", schedule conflict" : "";
              info.el.setAttribute("tabindex", "0");
              info.el.setAttribute(
                "aria-label",
                `${info.event.title}, ${props.location || "location TBA"}${conflictText}`,
              );
            }}
            events={events}
            expandRows
            firstDay={isFinals ? 6 : 1}
            headerToolbar={false}
            height="auto"
            hiddenDays={isFinals ? [0] : undefined}
            initialDate={isFinals ? term.finalsStart : term.calendarStart}
            initialView="timeGridWeek"
            key={`${mode}-${term.id}`}
            nowIndicator={false}
            plugins={[timeGridPlugin]}
            slotDuration="00:30:00"
            slotEventOverlap
            slotLabelFormat={{
              hour: "numeric",
              minute: "2-digit",
              omitZeroMinute: true,
              meridiem: "narrow",
            }}
            slotMaxTime="22:00:00"
            slotMinTime="07:00:00"
            weekends={isFinals}
          />
        </div>
      </div>
    </div>
  );
}

function renderEvent(
  info: EventContentArg,
  onRemove?: (id: string) => void,
) {
  const props = info.event.extendedProps;
  return (
    <div className="calendar-event-content">
      <strong>{props.courseAbbr}</strong>
      <span>{props.meetingType}</span>
      <small>{props.location || "TBA"}</small>
      {props.conflict ? <Icon name="alert" size={12} /> : null}
      {onRemove ? (
        <button
          aria-label={`Remove ${props.courseAbbr}`}
          className="calendar-event-remove"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove(props.packageId);
          }}
          type="button"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
