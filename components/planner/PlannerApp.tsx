"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadPlanner,
  makePackage,
  savePlanner,
  type Course,
  type PlannedPackage,
  type SectionGroup,
} from "@/lib/planner";
import { ConnectionPanel } from "./ConnectionPanel";
import { CourseSearch } from "./CourseSearch";
import { Icon } from "./Icons";
import { ProjectLinks } from "./ProjectLinks";
import { PlanSummary } from "./PlanSummary";
import { ScheduleCalendar } from "./ScheduleCalendar";

type AuthState = "checking" | "connected" | "disconnected";

export function PlannerApp() {
  const [auth, setAuth] = useState<AuthState>("checking");
  const [authNotice, setAuthNotice] = useState("");
  const [planned, setPlanned] = useState<PlannedPackage[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [appMessage, setAppMessage] = useState("");

  useEffect(() => {
    const storageTimer = window.setTimeout(() => {
      setPlanned(loadPlanner(window.localStorage));
      setStorageReady(true);
    }, 0);

    const controller = new AbortController();
    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { connected?: boolean };
        setAuth(body.connected === true ? "connected" : "disconnected");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAuthNotice("We couldn’t verify a TSS session. Connect to continue.");
        setAuth("disconnected");
      }
    }
    checkSession();
    return () => {
      window.clearTimeout(storageTimer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      savePlanner(window.localStorage, planned);
    } catch {
      const timer = window.setTimeout(
        () =>
          setAppMessage(
            "Your browser blocked planner storage. This plan may not persist.",
          ),
        0,
      );
      return () => window.clearTimeout(timer);
    }
  }, [planned, storageReady]);

  const handleSessionExpired = useCallback(() => {
    setAuthNotice("Your TSS session expired. Paste a fresh cookie to reconnect.");
    setAuth("disconnected");
  }, []);

  function addPackage(course: Course, section: SectionGroup) {
    const next = makePackage(course, section);
    setPlanned((current) =>
      current.some((item) => item.id === next.id) ? current : [...current, next],
    );
  }

  function removePackage(id: string) {
    setPlanned((current) => current.filter((item) => item.id !== id));
  }

  async function disconnect() {
    setDisconnecting(true);
    setAppMessage("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error();
      setAuthNotice("Disconnected. Your course plan remains saved on this device.");
      setAuth("disconnected");
    } catch {
      setAppMessage("Could not disconnect from the server. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="planner-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>Triton Planner</strong>
            <span>UC San Diego course planning</span>
          </div>
        </div>

        <div className="header-actions">
          <ProjectLinks />
          <div className="term-badge" aria-label="Planning term Fall 2026">
            <Icon name="calendar" size={15} />
            <span>Fall 2026</span>
            <small>Fixed term</small>
          </div>
          <div
            className={`connection-status ${auth === "connected" ? "is-connected" : ""}`}
            role="status"
          >
            <span />
            {auth === "checking"
              ? "Checking session"
              : auth === "connected"
                ? "TSS connected"
                : "TSS disconnected"}
          </div>
          {auth === "connected" ? (
            <button
              className="disconnect-button"
              disabled={disconnecting}
              onClick={disconnect}
              type="button"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : null}
        </div>
      </header>

      {appMessage ? (
        <div className="app-alert" role="alert">
          <Icon name="alert" size={16} />
          <span>{appMessage}</span>
          <button aria-label="Dismiss message" onClick={() => setAppMessage("")} type="button">
            <Icon name="x" size={14} />
          </button>
        </div>
      ) : null}

      <main className="planner-workspace">
        <CourseSearch
          onAdd={addPackage}
          onRemove={removePackage}
          onSessionExpired={handleSessionExpired}
          planned={planned}
        />
        <div className="schedule-area">
          <ScheduleCalendar planned={planned} />
          <PlanSummary
            onClear={() => setPlanned([])}
            onRemove={removePackage}
            planned={planned}
          />
        </div>
      </main>

      {auth === "checking" ? (
        <div className="session-check-overlay" role="status">
          <span className="button-spinner" />
          Checking your secure TSS connection…
        </div>
      ) : null}

      <ConnectionPanel
        notice={authNotice}
        onConnected={() => {
          setAuthNotice("");
          setAuth("connected");
        }}
        open={auth === "disconnected"}
      />
    </div>
  );
}
