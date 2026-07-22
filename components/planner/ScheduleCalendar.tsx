"use client";

import type { EventContentArg } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { PlannedPackage } from "@/lib/planner";
import { toCalendarEvents } from "@/lib/planner";
import { Icon } from "./Icons";

export function ScheduleCalendar({ planned }: { planned: PlannedPackage[] }) {
  const events = toCalendarEvents(planned);

  return (
    <div className="calendar-shell">
      <div className="calendar-titlebar">
        <div>
          <span className="step-kicker">Weekly schedule</span>
          <h2>September 28 – October 2</h2>
        </div>
        <div className="calendar-legend">
          <span>
            <i className="legend-dot planned" />
            Planned
          </span>
          <span>
            <i className="legend-dot conflict" />
            Conflict
          </span>
        </div>
      </div>

      {planned.length === 0 ? (
        <div className="calendar-empty-note">
          <Icon name="plus" size={16} />
          Add a section package to place it on your week
        </div>
      ) : null}

      <div className="calendar-scroll" aria-label="Fall 2026 weekly course schedule">
        <div className="calendar-min-width">
          <FullCalendar
            allDaySlot={false}
            dayHeaderFormat={{ weekday: "short", day: "numeric" }}
            dayHeaderClassNames="planner-day-header"
            editable={false}
            eventContent={renderEvent}
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
            firstDay={1}
            headerToolbar={false}
            height="auto"
            initialDate="2026-09-28"
            initialView="timeGridWeek"
            nowIndicator={false}
            plugins={[timeGridPlugin]}
            slotDuration="00:30:00"
            slotLabelFormat={{
              hour: "numeric",
              minute: "2-digit",
              omitZeroMinute: true,
              meridiem: "narrow",
            }}
            slotMaxTime="22:00:00"
            slotMinTime="07:00:00"
            weekends={false}
          />
        </div>
      </div>
    </div>
  );
}

function renderEvent(info: EventContentArg) {
  const props = info.event.extendedProps;
  return (
    <div className="calendar-event-content">
      <strong>{props.courseAbbr}</strong>
      <span>{props.meetingType}</span>
      <small>{props.location || "TBA"}</small>
      {props.conflict ? <Icon name="alert" size={12} /> : null}
    </div>
  );
}
