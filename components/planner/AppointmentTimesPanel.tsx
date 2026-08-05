"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AcademicTerm } from "@/lib/tss/terms";
import type {
  AppointmentPass,
  AppointmentPassStatus,
  AppointmentTimesResponse,
} from "@/lib/tss/types";
import { Icon } from "./Icons";

type AppointmentTimesPanelProps = {
  open: boolean;
  term: AcademicTerm;
  onClose: () => void;
  onSessionExpired: () => void;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AppointmentTimesResponse };

const STATUS_LABEL: Record<AppointmentPassStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
};

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    if (body.error?.code === "SESSION_EXPIRED") return "SESSION_EXPIRED";
    return body.error?.message || `Request failed (HTTP ${response.status}).`;
  } catch {
    return `Request failed (HTTP ${response.status}).`;
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function AppointmentTimesPanel({
  open,
  term,
  onClose,
  onSessionExpired,
}: AppointmentTimesPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    if (!open) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    window.setTimeout(() => closeRef.current?.focus(), 50);

    async function load() {
      try {
        const params = new URLSearchParams({
          year: String(term.academicYear),
          period: String(term.academicPeriod),
        });
        const response = await fetch(`/api/appointments?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          const message = await readErrorMessage(response);
          if (message === "SESSION_EXPIRED") {
            onSessionExpired();
            onClose();
            return;
          }
          setState({ status: "error", message });
          return;
        }
        const data = (await response.json()) as AppointmentTimesResponse;
        setState({ status: "ready", data });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: "Could not load appointment times. Please try again.",
        });
      }
    }

    load();
    return () => controller.abort();
  }, [open, term.academicYear, term.academicPeriod, onClose, onSessionExpired]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="connection-backdrop appointment-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="appointment-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="appointment-panel-header">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-icon">
                <Icon name="clock" size={15} />
              </span>
              Registration windows
            </div>
            <h2 id={titleId}>Appointment times</h2>
            <p id={descriptionId} className="appointment-panel-lede">
              When you can enroll for {term.shortLabel} on TSS.
            </p>
          </div>
          <button
            ref={closeRef}
            aria-label="Close appointment times"
            className="icon-button appointment-close"
            onClick={onClose}
            type="button"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="appointment-panel-body">
          {state.status === "loading" || state.status === "idle" ? (
            <div className="appointment-loading" role="status">
              <span className="button-spinner" aria-hidden="true" />
              Loading appointment times…
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="appointment-error" role="alert">
              <Icon name="alert" size={16} />
              <span>{state.message}</span>
            </div>
          ) : null}

          {state.status === "ready" ? (
            <AppointmentContent data={state.data} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AppointmentContent({ data }: { data: AppointmentTimesResponse }) {
  return (
    <>
      <p className="appointment-term-meta">
        {data.academicSessionText}
        {data.academicYearText ? ` · ${data.academicYearText}` : ""}
      </p>

      {data.hasActiveHolds ? (
        <div className="appointment-hold" role="status">
          <Icon name="alert" size={15} />
          <span>
            You have active holds that may prevent registration. Contact the
            Registrar&apos;s Office for more information.
          </span>
        </div>
      ) : null}
      {!data.hasActiveHolds && data.hasFutureHolds ? (
        <div className="appointment-hold" role="status">
          <Icon name="alert" size={15} />
          <span>
            You have future holds that may prevent registration. Contact the
            Registrar&apos;s Office for more information.
          </span>
        </div>
      ) : null}
      {data.sessionNote ? (
        <p className="appointment-session-note">{data.sessionNote}</p>
      ) : null}

      {data.passes.length === 0 ? (
        <p className="appointment-empty">No appointment times available.</p>
      ) : (
        <ul className="appointment-pass-list">
          {data.passes.map((pass) => (
            <PassRow key={pass.id} pass={pass} />
          ))}
        </ul>
      )}
    </>
  );
}

function PassRow({ pass }: { pass: AppointmentPass }) {
  return (
    <li className={`appointment-pass is-${pass.status}`}>
      <div className="appointment-pass-title">
        <strong>{pass.label}</strong>
        <span className={`appointment-status is-${pass.status}`}>
          {STATUS_LABEL[pass.status]}
        </span>
      </div>
      <dl className="appointment-pass-meta">
        <div>
          <dt>Opens</dt>
          <dd>{formatTimestamp(pass.beginTimestamp)}</dd>
        </div>
        <div>
          <dt>Closes</dt>
          <dd>{formatTimestamp(pass.endTimestamp)}</dd>
        </div>
        <div>
          <dt>Unit Cap</dt>
          <dd>{pass.unitCap ? `${pass.unitCap} units` : "—"}</dd>
        </div>
        <div>
          <dt>Waitlists</dt>
          <dd>{pass.waitlists}</dd>
        </div>
      </dl>
    </li>
  );
}
