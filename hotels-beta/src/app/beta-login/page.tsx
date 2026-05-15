"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BetaLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit() {
    if (!password || loading) return;
    setLoading(true);
    setError(false);

    const res = await fetch("/api/beta-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.replace("/");
    } else {
      setError(true);
      setPassword("");
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

        {error && (
          <p
            style={{
              color: "rgba(220,80,80,0.8)",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Incorrect password
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
