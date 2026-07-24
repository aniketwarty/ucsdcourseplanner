"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

type ConnectionPanelProps = {
  open: boolean;
  notice?: string;
  onConnected: () => void;
  onSkip: () => void;
};

const SKIP_LIMITATIONS = [
  "Live course search",
  "Loading new section times and seats",
  "Refreshing saved courses from TSS",
] as const;

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return body.error?.message || "The cookie could not be verified.";
  } catch {
    return "The cookie could not be verified. Please try again.";
  }
}

export function ConnectionPanel({
  open,
  notice,
  onConnected,
  onSkip,
}: ConnectionPanelProps) {
  const [cookie, setCookie] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  if (!open) return null;

  async function connect(event: FormEvent) {
    event.preventDefault();
    const value = cookie.trim();
    if (!value) {
      setError("Paste your SAP session cookie to continue.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: value }),
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      setCookie("");
      setShowCookie(false);
      onConnected();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="connection-backdrop" role="presentation">
      <section
        aria-describedby="connection-description connection-why"
        aria-labelledby="connection-title"
        aria-modal="true"
        className="connection-panel"
        role="dialog"
      >
        <div className="connection-copy">
          <div className="eyebrow">
            <span className="eyebrow-icon">
              <Icon name="lock" size={15} />
            </span>
            Secure TSS connection
          </div>
          <h1 id="connection-title">Connect your UCSD account</h1>
          <p id="connection-description" className="connection-lede">
            Connect your active Triton Student System session to search live
            course sections. Your credential is used only to establish this
            session and is never saved to planner storage.
          </p>
          <div className="connection-why" id="connection-why">
            <strong>Why do I need to paste a cookie?</strong>
            <p>
              A cookie is a short-lived sign-in pass your browser gets after you
              log into TSS. This site uses it to look up live course times and
              seats without asking for your UCSD password.
            </p>
          </div>
          {notice ? (
            <div className="session-notice" role="status">
              <Icon name="alert" size={16} />
              {notice}
            </div>
          ) : null}

          <ol className="connection-steps">
            <li>
              <span>1</span>
              <p>
                Sign in at{" "}
                <a href="https://tss.ucsd.edu/fiori" target="_blank" rel="noreferrer">
                  tss.ucsd.edu/fiori
                  <Icon name="external" size={13} />
                </a>
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                Inspect (Ctrl + Shift + I) → Application → Cookies → <b>tss.ucsd.edu</b>
              </p>
            </li>
            <li>
              <span>3</span>
              <p>
                Copy the value of <code>SAP_SESSIONID_S4P_500</code>
              </p>
            </li>
          </ol>

          <form className="connection-form" onSubmit={connect}>
            <label htmlFor="session-cookie">SAP session cookie</label>
            <div className="secret-field">
              <input
                ref={inputRef}
                id="session-cookie"
                autoComplete="off"
                name="session-cookie"
                onChange={(event) => {
                  setCookie(event.target.value);
                  if (error) setError("");
                }}
                placeholder="Paste cookie value"
                spellCheck={false}
                type={showCookie ? "text" : "password"}
                value={cookie}
              />
              <button
                aria-label={showCookie ? "Hide cookie" : "Show cookie"}
                className="icon-button"
                onClick={() => setShowCookie((visible) => !visible)}
                type="button"
              >
                <Icon name={showCookie ? "eyeOff" : "eye"} />
              </button>
            </div>
            {error ? (
              <div className="form-error-block" role="alert">
                <p className="form-error">
                  <Icon name="alert" size={15} />
                  {error}
                </p>
                <p className="form-error-hint">
                  If this keeps failing, sign out of TSS and sign back in, then
                  paste the fresh cookie value.
                </p>
              </div>
            ) : null}
            <button className="primary-button connect-button" disabled={submitting} type="submit">
              {submitting ? <span className="button-spinner" /> : <Icon name="lock" size={16} />}
              {submitting ? "Connecting…" : "Connect securely"}
            </button>
          </form>

          <div className="connection-skip">
            <button
              className="text-button connection-skip-button"
              disabled={submitting}
              onClick={onSkip}
              type="button"
            >
              Skip for now — view my plan
            </button>
            <p className="connection-skip-note">
              Without connecting: {SKIP_LIMITATIONS.join(" · ")}.
            </p>
          </div>
        </div>

        <div className="devtools-illustration" aria-hidden="true">
          <div className="browser-chrome">
            <span />
            <span />
            <span />
            <div className="address-bar">tss.ucsd.edu/fiori</div>
          </div>
          <div className="devtools-tabs">
            <span>Elements</span>
            <span>Console</span>
            <span className="active">Application</span>
          </div>
          <div className="devtools-body">
            <div className="cookie-tree">
              <small>STORAGE</small>
              <div>▾ Cookies</div>
              <div className="tree-child">tss.ucsd.edu</div>
            </div>
            <div className="cookie-table">
              <div className="table-header">
                <span>Name</span>
                <span>Value</span>
              </div>
              <div className="table-row selected">
                <span>SAP_SESSIONID_…</span>
                <span>••••••••••</span>
              </div>
              <div className="table-row">
                <span>sap-usercontext</span>
                <span>••••••</span>
              </div>
              <div className="copy-callout">
                <Icon name="check" size={14} />
                Copy value
              </div>
            </div>
          </div>
          <p className="illustration-caption">Illustration only — no credential shown</p>
        </div>
      </section>
    </div>
  );
}
