"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadPlanner,
  makePackage,
  refreshPlannedPackages,
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

type AuthState = "checking" | "connected" | "disconnected" | "offline";

const SKIP_STORAGE_KEY = "ucsd-course-planner:skip-connect";

type ApiError = { error?: { code?: string; message?: string } };

async function readApiError(response: Response): Promise<ApiError> {
  try {
    return (await response.json()) as ApiError;
  } catch {
    return {};
  }
}

function readSkipPreference(): boolean {
  try {
    return window.sessionStorage.getItem(SKIP_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSkipPreference(skipped: boolean) {
  try {
    if (skipped) window.sessionStorage.setItem(SKIP_STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(SKIP_STORAGE_KEY);
  } catch {
    // Ignore storage failures; skip is best-effort for this tab.
  }
}

export function PlannerApp() {
  const term = useMemo(() => getCurrentTerm(), []);
  const [auth, setAuth] = useState<AuthState>("checking");
  const [authNotice, setAuthNotice] = useState("");
  const [planned, setPlanned] = useState<PlannedPackage[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [appMessage, setAppMessage] = useState("");
  const [planView, setPlanView] = useState<PlanView>("calendar");
  const [syncing, setSyncing] = useState(false);
  const syncedSessionRef = useRef(false);
  const plannedRef = useRef(planned);
  plannedRef.current = planned;

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
        if (!response.ok) {
          setAuthNotice(
            `We couldn’t verify a TSS session. Connect to continue. (HTTP ${response.status})`,
          );
          setAuth(readSkipPreference() ? "offline" : "disconnected");
          return;
        }
        const body = (await response.json()) as { connected?: boolean };
        if (body.connected === true) {
          writeSkipPreference(false);
          setAuth("connected");
          return;
        }
        setAuth(readSkipPreference() ? "offline" : "disconnected");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAuthNotice("We couldn’t verify a TSS session. Connect to continue.");
        setAuth(readSkipPreference() ? "offline" : "disconnected");
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
    syncedSessionRef.current = false;
    writeSkipPreference(false);
    setAuthNotice(
      "Your TSS login was rejected. Paste a fresh SAP_SESSIONID_S4P_500 value.",
    );
    setAuth("disconnected");
  }, []);

  useEffect(() => {
    if (auth !== "connected" || !storageReady) return;
    if (syncedSessionRef.current) return;

    const controller = new AbortController();
    let cancelled = false;

    async function syncPlanned() {
      setSyncing(true);
      try {
        const snapshot = plannedRef.current;
        const packages = snapshot.filter((item) => isSameTerm(item.course, term));
        if (packages.length === 0) {
          syncedSessionRef.current = true;
          return;
        }

        const moduleIds = Array.from(
          new Set(packages.map((item) => item.course.moduleId)),
        );
        const sectionsByModuleId: Record<string, SectionGroup[]> = {};

        await Promise.all(
          moduleIds.map(async (moduleId) => {
            const params = new URLSearchParams({
              year: String(term.academicYear),
              period: String(term.academicPeriod),
            });
            const response = await fetch(
              `/api/courses/${encodeURIComponent(moduleId)}/sections?${params}`,
              { credentials: "same-origin", signal: controller.signal },
            );
            if (!response.ok) {
              const body = await readApiError(response);
              if (body.error?.code === "SESSION_EXPIRED") {
                handleSessionExpired();
                throw new DOMException("Aborted", "AbortError");
              }
              throw new Error(
                body.error?.message || "Could not refresh saved courses.",
              );
            }
            const body = (await response.json()) as { sections?: SectionGroup[] };
            sectionsByModuleId[moduleId] = Array.isArray(body.sections)
              ? body.sections
              : [];
          }),
        );

        if (cancelled) return;

        const result = refreshPlannedPackages(
          plannedRef.current,
          sectionsByModuleId,
        );
        syncedSessionRef.current = true;

        if (result.updatedIds.length > 0) {
          setPlanned(result.packages);
        }
        const parts: string[] = [];
        if (result.changedIds.length > 0) {
          parts.push(
            `Updated ${result.changedIds.length} saved section${
              result.changedIds.length === 1 ? "" : "s"
            } from TSS`,
          );
        }
        if (result.missingIds.length > 0) {
          parts.push(
            `${result.missingIds.length} section${
              result.missingIds.length === 1 ? "" : "s"
            } no longer listed in TSS`,
          );
        }
        if (parts.length > 0) {
          setAppMessage(`${parts.join(". ")}.`);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          syncedSessionRef.current = true;
          setAppMessage(
            error instanceof Error
              ? error.message
              : "Could not refresh saved courses from TSS.",
          );
        }
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }

    void syncPlanned();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // Only sync once per connected session after local plan is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on connect
  }, [auth, storageReady, term, handleSessionExpired]);

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

  function openConnect() {
    writeSkipPreference(false);
    setAuth("disconnected");
  }

  function skipConnect() {
    writeSkipPreference(true);
    setAuthNotice("");
    setAppMessage(
      "Viewing your saved plan offline. Course search and live TSS updates stay disabled until you connect.",
    );
    setAuth("offline");
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
      syncedSessionRef.current = false;
      writeSkipPreference(false);
      setAuthNotice("Disconnected. Your course plan remains saved on this device.");
      setAuth("disconnected");
    } catch {
      setAppMessage("Could not disconnect from the server. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  const offline = auth === "offline";
  const sessionPending = auth === "checking";

  if (sessionPending) {
    return (
      <div className="planner-app planner-app-loading">
        <div className="session-check" role="status" aria-live="polite">
          <div className="session-check-brand">
            <span className="brand-eyebrow">UC San Diego</span>
            <strong>Schedule Planner</strong>
          </div>
          <span className="session-check-spinner" aria-hidden="true" />
          <p className="session-check-copy">Checking your TSS connection</p>
        </div>
      </div>
    );
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
          <div
            className={`connection-status ${
              auth === "connected" ? "is-connected" : offline ? "is-offline" : ""
            }`}
            role="status"
          >
            <span />
            {auth === "connected"
              ? syncing
                ? "Syncing plan…"
                : "TSS connected"
              : offline
                ? "Viewing offline"
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
          {offline ? (
            <button className="disconnect-button" onClick={openConnect} type="button">
              Connect
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
          disabled={offline}
          onAdd={addPackage}
          onConnect={openConnect}
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

      <ConnectionPanel
        notice={authNotice}
        onConnected={() => {
          writeSkipPreference(false);
          syncedSessionRef.current = false;
          setAuthNotice("");
          setAuth("connected");
        }}
        onSkip={skipConnect}
        open={auth === "disconnected"}
      />
    </div>
  );
}
