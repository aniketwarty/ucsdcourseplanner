"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadPlanner,
  makePackage,
  savePlanner,
  type Course,
  type PlannedPackage,
  type SectionGroup,
} from "@/lib/planner";
import {
  getCurrentTerm,
  isSameTerm,
} from "@/lib/tss/terms";
import { ConnectionPanel } from "./ConnectionPanel";
import { CourseSearch } from "./CourseSearch";
import { Icon } from "./Icons";
import { PlanPane, type PlanView } from "./PlanPane";
import { ProjectLinks } from "./ProjectLinks";

type AuthState = "checking" | "connected" | "disconnected";

export function PlannerApp() {
  const term = useMemo(() => getCurrentTerm(), []);
  const [auth, setAuth] = useState<AuthState>("checking");
  const [authNotice, setAuthNotice] = useState("");
  const [planned, setPlanned] = useState<PlannedPackage[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [appMessage, setAppMessage] = useState("");
  const [planView, setPlanView] = useState<PlanView>("calendar");

  const termPlanned = useMemo(
    () => planned.filter((item) => isSameTerm(item.course, term)),
    [planned, term],
  );

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
    setAuthNotice(
      "Your TSS login was rejected. Paste a fresh SAP_SESSIONID_S4P_500 value.",
    );
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

  function clearTermPlan() {
    setPlanned((current) =>
      current.filter((item) => !isSameTerm(item.course, term)),
    );
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
          <div>
            <span className="brand-eyebrow">UC San Diego</span>
            <strong>Schedule Planner</strong>
          </div>
        </div>

        <div className="header-actions">
          <ProjectLinks />
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
          <div className="term-badge" aria-label={`Planning term ${term.shortLabel}`}>
            {term.shortLabel}
          </div>
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
          planned={termPlanned}
          term={term}
        />
        <PlanPane
          onClear={clearTermPlan}
          onRemove={removePackage}
          onViewChange={setPlanView}
          planned={termPlanned}
          term={term}
          view={planView}
        />
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
