"use client";

import { useState, useRef, useEffect } from "react";

export default function BetaLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* Full page load, not router.replace().
   *
   * The soft navigation could hang indefinitely: the client router may still
   * hold a cached RSC entry for "/" from before the cookie existed — which was
   * the middleware redirect back to this page — so it bounced, never committed,
   * and `loading` was only ever cleared on the failure branch. The button sat
   * on "…" forever and read as a rejected password.
   *
   * A document request re-runs middleware with the new cookie and cannot use
   * that cache. There is no client state worth preserving across this gate, so
   * the soft navigation bought nothing. */
  async function handleSubmit() {
    if (!password || loading) return;
    setLoading(true);
    setError(false);
    setFailed(false);

    try {
      const res = await fetch("/api/beta-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.location.assign("/");
        return; // leave `loading` set: the page is being replaced
      }

      setError(true);
      setPassword("");
      setLoading(false);
      inputRef.current?.focus();
    } catch {
      // A network failure previously left the button spinning with no message,
      // because nothing reset `loading` outside the password-wrong branch.
      setFailed(true);
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 13,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Type password to enter beta site
        </p>

        <input
          ref={inputRef}
          type="text"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          autoComplete="off"
          style={{
            background: "transparent",
            border: "none",
            borderBottom: `1px solid ${error ? "rgba(220,80,80,0.7)" : "rgba(255,255,255,0.2)"}`,
            color: "rgba(255,255,255,0.85)",
            fontSize: 18,
            letterSpacing: "0.25em",
            textAlign: "center",
            padding: "8px 0",
            width: 220,
            outline: "none",
            caretColor: "rgba(255,255,255,0.6)",
          }}
        />

        {(error || failed) && (
          <p
            style={{
              color: "rgba(220,80,80,0.8)",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            {error ? "Incorrect password" : "Couldn't reach the site — try again"}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!password || loading}
          style={{
            marginTop: 8,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "rgba(255,255,255,0.6)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "8px 28px",
            cursor: password && !loading ? "pointer" : "default",
            opacity: password && !loading ? 1 : 0.35,
            transition: "opacity 0.2s",
          }}
        >
          {loading ? "…" : "Enter"}
        </button>
      </div>
    </div>
  );
}
